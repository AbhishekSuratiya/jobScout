// Shared helpers used by collectors and the filter engine.

export function stripHtml(html: string | null | undefined): string {
  if (!html) return '';
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;|&rsquo;|&lsquo;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

// Best-effort minimum-years-of-experience extraction from a job description.
// Looks for patterns like "3+ years", "3-5 years", "minimum 4 years".
export function parseMinYears(text: string): { minYears: number | null; phrase: string | null } {
  if (!text) return { minYears: null, phrase: null };
  const t = text.toLowerCase();
  const patterns = [
    /(\d{1,2})\s*\+?\s*(?:to|-|–)\s*(\d{1,2})\s*\+?\s*years?/, // 3-5 years
    /(\d{1,2})\s*\+\s*years?/, // 3+ years
    /(?:minimum|min\.?|at least|over)\s*(\d{1,2})\s*years?/, // minimum 3 years
    /(\d{1,2})\s*years?(?:\s*of)?\s*(?:experience|exp)/, // 3 years experience
  ];
  for (const re of patterns) {
    const m = t.match(re);
    if (m) {
      const n = parseInt(m[1], 10);
      if (!Number.isNaN(n) && n >= 0 && n <= 25) {
        return { minYears: n, phrase: m[0].trim() };
      }
    }
  }
  return { minYears: null, phrase: null };
}

// Best-effort salary parse from a free-text salary string, e.g. "$120,000 - $150,000".
export function parseSalary(text: string | null | undefined): {
  min: number | null;
  max: number | null;
  currency: string | null;
} {
  if (!text) return { min: null, max: null, currency: null };
  const currency = /£/.test(text) ? 'GBP' : /€/.test(text) ? 'EUR' : /\$|usd/i.test(text) ? 'USD' : null;
  // Capture numbers, honoring "k" shorthand.
  const nums: number[] = [];
  const re = /(\d{1,3}(?:[,.\s]\d{3})*|\d+)\s*(k)?/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    let n = parseFloat(m[1].replace(/[,\s]/g, ''));
    if (Number.isNaN(n)) continue;
    if (m[2]) n *= 1000;
    if (n >= 1000) nums.push(n); // ignore stray small numbers
  }
  if (nums.length === 0) return { min: null, max: null, currency };
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  return { min, max: max === min ? null : max, currency };
}

const FRONTEND_HINTS = [
  'frontend', 'front-end', 'front end', 'react', 'vue', 'angular', 'svelte',
  'javascript', 'typescript', 'ui engineer', 'web developer', 'react native',
];

export function detectCategory(title: string, tags: string[]): string | null {
  const hay = (title + ' ' + tags.join(' ')).toLowerCase();
  if (FRONTEND_HINTS.some((h) => hay.includes(h))) return 'frontend';
  return null;
}

export function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return (Date.now() - t) / (1000 * 60 * 60 * 24);
}

// fetch with a timeout and a browser-like UA, returning text.
export async function fetchText(
  url: string,
  opts: { headers?: Record<string, string>; timeoutMs?: number } = {},
): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? 15000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
        Accept: 'application/json, text/html, application/xml;q=0.9, */*;q=0.8',
        ...(opts.headers ?? {}),
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return await res.text();
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchJson<T = unknown>(
  url: string,
  opts: { headers?: Record<string, string>; timeoutMs?: number } = {},
): Promise<T> {
  const text = await fetchText(url, opts);
  return JSON.parse(text) as T;
}
