// Frontend mirror of the backend contract.
export interface Job {
  id: string;
  source: string;
  sourceLabel: string;
  title: string;
  company: string;
  location: string;
  remote: boolean;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryText: string | null;
  currency: string | null;
  postedAt: string | null;
  url: string;
  tags: string[];
  description: string;
  experienceText: string | null;
  minYears: number | null;
  category: string | null;
}

export interface SourceMeta {
  id: string;
  label: string;
  reliability: 'stable' | 'fragile';
  note: string;
  paginates: boolean;
}

export interface CollectorResult {
  source: string;
  ok: boolean;
  count: number;
  error?: string;
}

export interface SearchResponse {
  jobs: Job[];
  collectors: CollectorResult[];
  total: number;
}

// Per-source results bucket — one section/tab per job portal.
export interface SourceResult {
  jobs: Job[];
  page: number; // last page fetched
  hasMore: boolean; // can we fetch another page?
  loading: boolean;
  error: string | null;
}

export interface Filters {
  query: string;
  location: string; // scopes location-based boards (LinkedIn, Naukri)
  titleMustInclude: string; // comma/space separated in UI
  skills: string[];
  skillMatchMode: 'any' | 'all';
  remoteOnly: boolean;
  salaryMin: string;
  postedWithinDays: string;
  minYears: string;
  maxYears: string;
  category: string;
}
