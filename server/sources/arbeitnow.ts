import type { Job } from '../types.ts';
import { fetchJson, stripHtml, parseMinYears, detectCategory } from '../util.ts';

interface ArbeitnowJob {
  slug: string;
  company_name: string;
  title: string;
  description: string;
  remote: boolean;
  url: string;
  tags?: string[];
  job_types?: string[];
  location: string;
  created_at: number; // unix seconds
}

// Arbeitnow — public job-board JSON API. No search param; filter locally.
export async function collect(_query: string, page: number): Promise<Job[]> {
  const data = await fetchJson<{ data: ArbeitnowJob[] }>(
    `https://www.arbeitnow.com/api/job-board-api?page=${page}`,
  );
  return (data.data ?? []).map((j) => {
    const desc = stripHtml(j.description);
    const exp = parseMinYears(desc);
    const tags = j.tags ?? [];
    return {
      id: `arbeitnow-${j.slug}`,
      source: 'arbeitnow',
      sourceLabel: 'Arbeitnow',
      title: j.title,
      company: j.company_name,
      location: j.location || (j.remote ? 'Remote' : 'Unknown'),
      remote: !!j.remote,
      salaryMin: null,
      salaryMax: null,
      salaryText: null,
      currency: null,
      postedAt: j.created_at ? new Date(j.created_at * 1000).toISOString() : null,
      url: j.url,
      tags,
      description: desc,
      experienceText: exp.phrase,
      minYears: exp.minYears,
      category: detectCategory(j.title, tags),
    } satisfies Job;
  });
}
