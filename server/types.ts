// Common, normalized job shape that every collector must produce.
// Keeping one shape means filtering/UI never needs to know which site a job came from.
export interface Job {
  id: string;
  source: string; // collector id, e.g. "remotive"
  sourceLabel: string; // human label, e.g. "Remotive"
  title: string;
  company: string;
  location: string;
  remote: boolean;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryText: string | null;
  currency: string | null;
  postedAt: string | null; // ISO 8601
  url: string;
  tags: string[];
  description: string; // plain-ish text, used for skill/experience matching
  experienceText: string | null; // best-effort extracted experience phrase
  minYears: number | null; // best-effort parsed minimum years
  category: string | null; // best-effort, e.g. "frontend"
}

export interface SearchParams {
  // which collectors to run
  sources: string[];
  // free-text query passed to source APIs that support it
  query: string;
  // Location to scope location-based boards (LinkedIn, Naukri). Remote-only
  // boards (Remotive, RemoteOK, …) ignore it. Empty = worldwide.
  location: string;
  // STRICT local filter: every term here must appear in the job TITLE.
  // This is the "100% sure it's actually a React Native job" filter.
  titleMustInclude: string[];
  // skills that must appear somewhere (title/tags/description)
  skills: string[];
  skillMatchMode: 'any' | 'all';
  remoteOnly: boolean;
  salaryMin: number | null; // keep jobs whose known salary >= this
  postedWithinDays: number | null; // freshness
  minYears: number | null; // experience lower bound
  maxYears: number | null; // experience upper bound
  category: string | null; // e.g. "frontend"
  page: number; // 1-based; used for infinite scroll within a source section
}

// Context handed to each collector so location-based boards can scope their
// query and forward the freshness window to the source's own time filter.
export interface CollectContext {
  location: string; // empty = worldwide
  postedWithinDays: number | null;
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
