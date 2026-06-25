import type { Job, SearchParams } from './types.ts';
import { daysSince } from './util.ts';

const lc = (s: string) => s.toLowerCase();

// Apply all local filters to the raw collected jobs.
// Order is cheap-checks-first so we discard early.
export function applyFilters(jobs: Job[], p: SearchParams): Job[] {
  const titleTerms = p.titleMustInclude.map(lc).filter(Boolean);
  const skillTerms = p.skills.map(lc).filter(Boolean);

  return jobs.filter((job) => {
    const title = lc(job.title);

    // 1. STRICT title filter — the headline feature. Every required term must
    //    literally appear in the job title. This is what guarantees a
    //    "React Native" search returns only real React Native roles.
    if (titleTerms.length && !titleTerms.every((t) => title.includes(t))) {
      return false;
    }

    // 2. Remote only.
    if (p.remoteOnly && !job.remote) return false;

    // 3. Category (e.g. frontend).
    if (p.category && job.category !== p.category) return false;

    // 4. Freshness. Compare in whole calendar days because many boards report
    //    only a date (no time), which would otherwise make a job posted
    //    "yesterday" read as >1 day old and wrongly fail a "past 24h" filter.
    if (p.postedWithinDays != null) {
      const d = daysSince(job.postedAt);
      // Unknown date is treated as too old when a freshness filter is active.
      if (d == null || Math.floor(d) > p.postedWithinDays) return false;
    }

    // 5. Salary floor — only filter jobs whose salary is actually known.
    if (p.salaryMin != null) {
      const known = job.salaryMax ?? job.salaryMin;
      if (known != null && known < p.salaryMin) return false;
    }

    // 6. Experience range — only filter when we managed to parse years.
    if ((p.minYears != null || p.maxYears != null) && job.minYears != null) {
      if (p.minYears != null && job.minYears < p.minYears) return false;
      if (p.maxYears != null && job.minYears > p.maxYears) return false;
    }

    // 7. Skills — match across title + tags + description.
    if (skillTerms.length) {
      const hay = lc(job.title + ' ' + job.tags.join(' ') + ' ' + job.description);
      const matched = (t: string) => hay.includes(t);
      if (p.skillMatchMode === 'all') {
        if (!skillTerms.every(matched)) return false;
      } else {
        if (!skillTerms.some(matched)) return false;
      }
    }

    return true;
  });
}

// Newest first; jobs with unknown dates sink to the bottom.
export function sortByFreshness(jobs: Job[]): Job[] {
  return [...jobs].sort((a, b) => {
    const ta = a.postedAt ? Date.parse(a.postedAt) : 0;
    const tb = b.postedAt ? Date.parse(b.postedAt) : 0;
    return tb - ta;
  });
}

// De-duplicate across sources by company + normalized title.
export function dedupe(jobs: Job[]): Job[] {
  const seen = new Set<string>();
  const out: Job[] = [];
  for (const job of jobs) {
    const key = lc(job.company.trim()) + '::' + lc(job.title.trim().replace(/\s+/g, ' '));
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(job);
  }
  return out;
}
