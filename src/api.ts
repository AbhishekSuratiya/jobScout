import type { Filters, SearchResponse, SourceMeta } from './types';

export async function fetchSources(): Promise<SourceMeta[]> {
  const res = await fetch('/api/sources');
  if (!res.ok) throw new Error('Could not load sources');
  return res.json();
}

// Split a free-text field on commas (so "react native, expo" -> two terms,
// but "react native" stays one phrase).
function splitTerms(s: string): string[] {
  return s
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

export async function searchJobs(sources: string[], f: Filters, page = 1): Promise<SearchResponse> {
  const body = {
    sources,
    query: f.query.trim(),
    location: f.location.trim(),
    titleMustInclude: splitTerms(f.titleMustInclude),
    skills: f.skills,
    skillMatchMode: f.skillMatchMode,
    remoteOnly: f.remoteOnly,
    salaryMin: f.salaryMin || null,
    postedWithinDays: f.postedWithinDays || null,
    minYears: f.minYears || null,
    maxYears: f.maxYears || null,
    category: f.category || null,
    page,
  };
  const res = await fetch('/api/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Search failed (${res.status})`);
  }
  return res.json();
}
