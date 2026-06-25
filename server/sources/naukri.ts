import type { Job, CollectContext } from '../types.ts';
import { stripHtml, parseSalary, parseMinYears, detectCategory } from '../util.ts';

// Naukri — FRAGILE / BEST-EFFORT (headless-browser backed).
//
// Naukri has no public API and its internal `/jobapi/v3/search` endpoint
// rejects plain HTTP requests with "recaptcha required". The only way through
// is to load the real search page in a headless browser, let Naukri's own
// JavaScript mint the anti-bot/reCAPTCHA token, and intercept the JSON response
// the page itself fetches. We read that intercepted payload — no DOM scraping
// of brittle class names needed.
//
// This is heavier (launches Chromium) and still ToS-exposed, so it stays in the
// fragile tier and is isolated by the orchestrator. Pair with the strict title
// filter — Naukri keyword search is noisy.

interface NaukriPlaceholder {
  type?: string;
  label?: string;
}
interface NaukriJob {
  jobId?: string;
  title?: string;
  companyName?: string;
  jdURL?: string;
  createdDate?: number; // epoch ms
  footerPlaceholderLabel?: string;
  jobDescription?: string;
  tagsAndSkills?: string;
  placeholders?: NaukriPlaceholder[];
}

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export async function collect(query: string, page: number, ctx?: CollectContext): Promise<Job[]> {
  // Lazy-import so the server still boots if Playwright/Chromium isn't installed.
  let chromium: typeof import('playwright').chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    throw new Error('Naukri needs Playwright. Run: npm i playwright && npx playwright install chromium');
  }

  const keyword = (query || 'software developer').trim();
  const slug = keyword.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  // Naukri paginates via a `-N` suffix on the SEO path, e.g. /react-native-jobs-2
  const pageSuffix = page > 1 ? `-${page}` : '';
  const params = new URLSearchParams({ k: keyword });
  if (ctx?.location) params.set('l', ctx.location); // Naukri location param
  // Map freshness to Naukri's jobAge buckets (1/3/7/15 days).
  if (ctx?.postedWithinDays != null) {
    const buckets = [1, 3, 7, 15];
    const age = buckets.find((b) => ctx.postedWithinDays! <= b) ?? 15;
    params.set('jobAge', String(age));
  }
  const searchUrl = `https://www.naukri.com/${slug}-jobs${pageSuffix}?${params.toString()}`;

  // Akamai Bot Manager blocks default headless Chromium at the CDN edge, so we
  // launch with the automation flag disabled and spoof the usual headless
  // tells (navigator.webdriver, plugins, languages) before any page script runs.
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox'],
  });
  try {
    const context = await browser.newContext({
      userAgent: UA,
      viewport: { width: 1366, height: 900 },
      locale: 'en-US',
      extraHTTPHeaders: {
        'Accept-Language': 'en-US,en;q=0.9',
        'sec-ch-ua': '"Chromium";v="120", "Not?A_Brand";v="24"',
        'sec-ch-ua-platform': '"macOS"',
      },
    });
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      // @ts-expect-error stealth shim
      window.chrome = { runtime: {} };
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3] });
      Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
    });
    const page = await context.newPage();

    // Capture the first successful internal search response the page fires.
    const captured = new Promise<NaukriJob[]>((resolve) => {
      page.on('response', async (res) => {
        if (!res.url().includes('/jobapi/v3/search')) return;
        if (res.status() !== 200) return;
        try {
          const body = (await res.json()) as { jobDetails?: NaukriJob[] };
          if (body.jobDetails?.length) resolve(body.jobDetails);
        } catch {
          /* ignore non-JSON */
        }
      });
    });

    // Visit the homepage first to pick up Akamai/session cookies, then search.
    await page.goto('https://www.naukri.com/', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Wait for the intercepted API payload, but don't hang forever.
    const timeout = new Promise<NaukriJob[]>((_, reject) =>
      setTimeout(() => reject(new Error('Naukri did not return results in time (blocked or slow).')), 25000),
    );
    const jobDetails = await Promise.race([captured, timeout]);

    return jobDetails.filter((j) => j && j.title).map(toJob);
  } finally {
    await browser.close();
  }
}

function toJob(j: NaukriJob): Job {
  const ph = (type: string) => j.placeholders?.find((p) => p.type === type)?.label ?? '';
  const expLabel = ph('experience'); // e.g. "3-5 Yrs"
  const salLabel = ph('salary'); // e.g. "Not disclosed" or "8-12 Lacs PA"
  const location = ph('location');
  const desc = stripHtml(j.jobDescription);
  const tags = (j.tagsAndSkills ?? '').split(',').map((t) => t.trim()).filter(Boolean);

  const expFromLabel = parseMinYears(expLabel);
  const exp = expFromLabel.minYears != null ? expFromLabel : parseMinYears(desc);
  const sal = parseSalary(salLabel);

  const jobUrl = j.jdURL
    ? j.jdURL.startsWith('http')
      ? j.jdURL
      : `https://www.naukri.com${j.jdURL}`
    : 'https://www.naukri.com';

  return {
    id: `naukri-${j.jobId ?? jobUrl.slice(-16)}`,
    source: 'naukri',
    sourceLabel: 'Naukri',
    title: j.title!,
    company: j.companyName || 'Unknown',
    location: location || 'India',
    remote: /remote|work from home|wfh/i.test(location + ' ' + j.title),
    salaryMin: sal.min,
    salaryMax: sal.max,
    salaryText: salLabel && !/not disclosed/i.test(salLabel) ? salLabel : null,
    currency: sal.currency ?? (salLabel ? 'INR' : null),
    postedAt: j.createdDate ? new Date(j.createdDate).toISOString() : null,
    url: jobUrl,
    tags,
    description: desc,
    experienceText: expLabel || exp.phrase,
    minYears: exp.minYears,
    category: detectCategory(j.title!, tags),
  };
}
