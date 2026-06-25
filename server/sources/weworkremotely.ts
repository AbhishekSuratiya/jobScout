import { XMLParser } from 'fast-xml-parser';
import type { Job } from '../types.ts';
import { fetchText, stripHtml, parseMinYears, detectCategory } from '../util.ts';

interface RssItem {
  title?: string;
  description?: string;
  link?: string;
  pubDate?: string;
  region?: string;
  type?: string;
  category?: string | string[];
}

// We Work Remotely — official RSS feed for the programming category.
// RSS is meant to be consumed, so this is stable and low-risk.
export async function collect(_query: string, page: number): Promise<Job[]> {
  if (page > 1) return []; // RSS feed is a single fixed list.
  const xml = await fetchText('https://weworkremotely.com/categories/remote-programming-jobs.rss');
  const parser = new XMLParser({ ignoreAttributes: false });
  const parsed = parser.parse(xml);
  const items: RssItem[] = parsed?.rss?.channel?.item ?? [];
  const list = Array.isArray(items) ? items : [items];

  return list
    .filter((it) => it && it.title)
    .map((it, i) => {
      // WWR titles follow "Company: Job Title".
      const raw = it.title!;
      const idx = raw.indexOf(':');
      const company = idx > -1 ? raw.slice(0, idx).trim() : 'Unknown';
      const title = idx > -1 ? raw.slice(idx + 1).trim() : raw.trim();
      const desc = stripHtml(it.description);
      const exp = parseMinYears(desc);
      const tags = Array.isArray(it.category) ? it.category : it.category ? [it.category] : [];
      return {
        id: `wwr-${i}-${(it.link ?? '').slice(-12)}`,
        source: 'weworkremotely',
        sourceLabel: 'We Work Remotely',
        title,
        company,
        location: it.region || 'Remote',
        remote: true,
        salaryMin: null,
        salaryMax: null,
        salaryText: null,
        currency: null,
        postedAt: it.pubDate ? new Date(it.pubDate).toISOString() : null,
        url: it.link ?? 'https://weworkremotely.com',
        tags,
        description: desc,
        experienceText: exp.phrase,
        minYears: exp.minYears,
        category: detectCategory(title, tags),
      } satisfies Job;
    });
}
