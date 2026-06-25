import type { Job } from '../types.ts';
import { fetchJson, stripHtml, parseSalary, parseMinYears, detectCategory } from '../util.ts';

interface JobicyJob {
  id: number;
  url: string;
  jobTitle: string;
  companyName: string;
  jobGeo: string;
  jobLevel?: string;
  jobExcerpt: string;
  jobDescription?: string;
  pubDate: string;
  annualSalaryMin?: string;
  annualSalaryMax?: string;
  salaryCurrency?: string;
  jobIndustry?: string[] | string;
}

// Jobicy — public remote-jobs JSON API. Supports a free-text `tag` param.
export async function collect(query: string, page: number): Promise<Job[]> {
  if (page > 1) return []; // Jobicy has no page param; one batch per call.
  const url = `https://jobicy.com/api/v2/remote-jobs?count=50${
    query ? `&tag=${encodeURIComponent(query)}` : ''
  }`;
  const data = await fetchJson<{ jobs: JobicyJob[] }>(url);
  return (data.jobs ?? []).map((j) => {
    const desc = stripHtml(j.jobDescription || j.jobExcerpt);
    const exp = parseMinYears(desc);
    const min = j.annualSalaryMin ? parseInt(j.annualSalaryMin, 10) : null;
    const max = j.annualSalaryMax ? parseInt(j.annualSalaryMax, 10) : null;
    const tags = Array.isArray(j.jobIndustry) ? j.jobIndustry : j.jobIndustry ? [j.jobIndustry] : [];
    const sal = parseSalary(`${j.annualSalaryMin ?? ''} ${j.annualSalaryMax ?? ''}`);
    return {
      id: `jobicy-${j.id}`,
      source: 'jobicy',
      sourceLabel: 'Jobicy',
      title: j.jobTitle,
      company: j.companyName,
      location: j.jobGeo || 'Remote',
      remote: true,
      salaryMin: min ?? sal.min,
      salaryMax: max ?? sal.max,
      salaryText: min || max ? `${min ?? '?'} - ${max ?? '?'} ${j.salaryCurrency ?? ''}`.trim() : null,
      currency: j.salaryCurrency ?? null,
      postedAt: j.pubDate || null,
      url: j.url,
      tags,
      description: desc,
      experienceText: exp.phrase,
      minYears: exp.minYears,
      category: detectCategory(j.jobTitle, tags),
    } satisfies Job;
  });
}
