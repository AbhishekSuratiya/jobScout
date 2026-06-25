import type { Job, CollectContext } from '../types.ts';
import { fetchText, stripHtml, parseMinYears, detectCategory } from '../util.ts';

// LinkedIn — FRAGILE / BEST-EFFORT.
//
// This scrapes LinkedIn's public *guest* job-search endpoint (the same one the
// logged-out site uses to lazy-load result cards). It needs no login, but:
//   - LinkedIn's ToS discourages scraping; use responsibly and lightly.
//   - The HTML/class names change and it is rate-limited, so it can return
//     nothing or get soft-blocked. It must NEVER block the rest of a run.
//
// This is exactly why the strict local title filter exists: LinkedIn keyword
// search is noisy, so we fetch broadly and let the title filter keep only the
// real matches.
// Map our freshness window (days) to LinkedIn's f_TPR ("time posted range")
// param so LinkedIn filters by time server-side, matching its own UI.
function tprParam(days: number | null): string {
  if (days == null) return '';
  return `&f_TPR=r${Math.round(days * 86400)}`;
}

export async function collect(query: string, page: number, ctx?: CollectContext): Promise<Job[]> {
  // The guest endpoint returns ~10 cards per page via the `start` offset.
  // Step by 10; any overlap across pages is removed by dedup, but stepping too
  // far would skip jobs.
  const keywords = query || 'software developer';
  const location = ctx?.location || 'Worldwide';
  const start = (Math.max(1, page) - 1) * 10;
  const url =
    'https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?' +
    `keywords=${encodeURIComponent(keywords)}&location=${encodeURIComponent(location)}` +
    `${tprParam(ctx?.postedWithinDays ?? null)}&start=${start}`;

  const html = await fetchText(url, { timeoutMs: 12000 });

  const jobs: Job[] = [];
  // Each card is a <li> with a base-card. Pull title, company, location, link.
  const cards = html.split('<li>').slice(1);
  for (const card of cards) {
    const title = matchText(card, /base-search-card__title[^>]*>([\s\S]*?)<\//);
    const company = matchText(card, /base-search-card__subtitle[^>]*>[\s\S]*?>([\s\S]*?)<\//);
    const location = matchText(card, /job-search-card__location[^>]*>([\s\S]*?)<\//);
    const link = (card.match(/href="(https:\/\/[^"]*?\/jobs\/view\/[^"?]+)/) || [])[1];
    const dateMatch = card.match(/datetime="([^"]+)"/);
    if (!title || !link) continue;
    const exp = parseMinYears(title);
    jobs.push({
      id: `linkedin-${(link.match(/view\/[^/]*?(\d+)/) || [])[1] ?? jobs.length}`,
      source: 'linkedin',
      sourceLabel: 'LinkedIn',
      title,
      company: company || 'Unknown',
      location: location || 'Unknown',
      remote: /remote/i.test(location || ''),
      salaryMin: null,
      salaryMax: null,
      salaryText: null,
      currency: null,
      postedAt: dateMatch ? new Date(dateMatch[1]).toISOString() : null,
      url: link,
      tags: [],
      description: '',
      experienceText: exp.phrase,
      minYears: exp.minYears,
      category: detectCategory(title, []),
    });
  }
  return jobs;
}

function matchText(s: string, re: RegExp): string | null {
  const m = s.match(re);
  return m ? stripHtml(m[1]) : null;
}
