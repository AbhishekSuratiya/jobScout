import type { Job } from '../types.ts';
import { fetchJson, stripHtml, parseMinYears, detectCategory } from '../util.ts';

interface RemoteOKJob {
  id?: string;
  slug?: string;
  position?: string;
  company?: string;
  location?: string;
  tags?: string[];
  date?: string;
  url?: string;
  apply_url?: string;
  description?: string;
  salary_min?: number;
  salary_max?: number;
}

// RemoteOK — public JSON API. First array element is metadata and is skipped.
// No server-side search param, so we fetch all and let local filters do the work.
export async function collect(_query: string, page: number): Promise<Job[]> {
  if (page > 1) return []; // RemoteOK returns all results in one call.
  const data = await fetchJson<RemoteOKJob[]>('https://remoteok.com/api');
  return data
    .filter((j) => j && j.id && j.position)
    .map((j) => {
      const desc = stripHtml(j.description);
      const exp = parseMinYears(desc);
      const tags = j.tags ?? [];
      return {
        id: `remoteok-${j.id}`,
        source: 'remoteok',
        sourceLabel: 'RemoteOK',
        title: j.position!,
        company: j.company ?? 'Unknown',
        location: j.location || 'Remote',
        remote: true,
        salaryMin: j.salary_min ?? null,
        salaryMax: j.salary_max ?? null,
        salaryText:
          j.salary_min || j.salary_max
            ? `$${(j.salary_min ?? 0).toLocaleString()} - $${(j.salary_max ?? 0).toLocaleString()}`
            : null,
        currency: j.salary_min || j.salary_max ? 'USD' : null,
        postedAt: j.date ?? null,
        url: j.url ?? j.apply_url ?? `https://remoteok.com/l/${j.id}`,
        tags,
        description: desc,
        experienceText: exp.phrase,
        minYears: exp.minYears,
        category: detectCategory(j.position!, tags),
      } satisfies Job;
    });
}
