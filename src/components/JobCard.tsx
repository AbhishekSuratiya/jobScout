import type { Job } from '../types';

function timeAgo(iso: string | null): string {
  if (!iso) return 'date unknown';
  const days = (Date.now() - Date.parse(iso)) / 86400000;
  if (Number.isNaN(days)) return 'date unknown';
  if (days < 1) return 'today';
  if (days < 2) return 'yesterday';
  if (days < 30) return `${Math.floor(days)} days ago`;
  if (days < 60) return 'last month';
  return `${Math.floor(days / 30)} months ago`;
}

function salaryLabel(job: Job): string | null {
  if (job.salaryText) return job.salaryText;
  if (job.salaryMin || job.salaryMax) {
    const c = job.currency === 'USD' ? '$' : job.currency ? job.currency + ' ' : '';
    const fmt = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}k` : `${n}`);
    return `${c}${fmt(job.salaryMin ?? 0)}${job.salaryMax ? ` – ${c}${fmt(job.salaryMax)}` : '+'}`;
  }
  return null;
}

export function JobCard({ job }: { job: Job }) {
  const salary = salaryLabel(job);
  return (
    <article className="job-card">
      <div className="job-head">
        <div>
          <a className="job-title" href={job.url} target="_blank" rel="noreferrer">
            {job.title}
          </a>
          <div className="job-company">
            {job.company} · {job.location}
          </div>
        </div>
        <span className="source-tag">{job.sourceLabel}</span>
      </div>

      <div className="job-meta">
        {job.remote && <span className="chip remote">Remote</span>}
        {salary && <span className="chip salary">{salary}</span>}
        {job.experienceText && <span className="chip exp">{job.experienceText}</span>}
        <span className="chip date">{timeAgo(job.postedAt)}</span>
      </div>

      {job.tags.length > 0 && (
        <div className="job-tags">
          {job.tags.slice(0, 8).map((t) => (
            <span key={t} className="tag">
              {t}
            </span>
          ))}
        </div>
      )}
    </article>
  );
}
