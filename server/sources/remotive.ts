import type { Job } from '../types.ts';
import { fetchJson, stripHtml, parseSalary, parseMinYears, detectCategory } from '../util.ts';

interface RemotiveJob {
  id: number;
  url: string;
  title: string;
  company_name: string;
  category: string;
  job_type: string;
  candidate_required_location: string;
  salary: string;
  publication_date: string;
  description: string;
  tags?: string[];
}

// Remotive — stable public JSON API. Supports server-side search.
export async function collect(query: string, page: number): Promise<Job[]> {
  if (page > 1) return []; // Remotive returns its whole batch in one call.
  const url = `https://remotive.com/api/remote-jobs?limit=80${
    query ? `&search=${encodeURIComponent(query)}` : ''
  }`;
  const data = await fetchJson<{ jobs: RemotiveJob[] }>(url);
  return (data.jobs ?? []).map((j) => {
    const desc = stripHtml(j.description);
    const sal = parseSalary(j.salary);
    const exp = parseMinYears(desc);
    const tags = j.tags ?? [];
    return {
      id: `remotive-${j.id}`,
      source: 'remotive',
      sourceLabel: 'Remotive',
      title: j.title,
      company: j.company_name,
      location: j.candidate_required_location || 'Remote',
      remote: true,
      salaryMin: sal.min,
      salaryMax: sal.max,
      salaryText: j.salary || null,
      currency: sal.currency,
      postedAt: j.publication_date || null,
      url: j.url,
      tags,
      description: desc,
      experienceText: exp.phrase,
      minYears: exp.minYears,
      category: detectCategory(j.title, tags) ?? (/(front|react|vue|angular)/i.test(j.category) ? 'frontend' : null),
    } satisfies Job;
  });
}
