import type { Job, CollectContext } from '../types.ts';
import * as remotive from './remotive.ts';
import * as remoteok from './remoteok.ts';
import * as arbeitnow from './arbeitnow.ts';
import * as jobicy from './jobicy.ts';
import * as weworkremotely from './weworkremotely.ts';
import * as linkedin from './linkedin.ts';
import * as naukri from './naukri.ts';

export type Reliability = 'stable' | 'fragile';

export interface SourceMeta {
  id: string;
  label: string;
  reliability: Reliability;
  // "stable" = public API/RSS, legal & dependable. "fragile" = HTML scraping,
  // best-effort, may break or get rate-limited.
  note: string;
  // Whether the source supports fetching further pages (for infinite scroll).
  // Sources that return their whole batch in one call set this false.
  paginates: boolean;
  collect: (query: string, page: number, ctx: CollectContext) => Promise<Job[]>;
}

// The registry IS the factory: add a source = add one entry here.
export const SOURCES: SourceMeta[] = [
  {
    id: 'remotive',
    label: 'Remotive',
    reliability: 'stable',
    note: 'Public JSON API. Remote tech jobs. Supports search.',
    paginates: false,
    collect: remotive.collect,
  },
  {
    id: 'remoteok',
    label: 'RemoteOK',
    reliability: 'stable',
    note: 'Public JSON API. Remote jobs with salary data.',
    paginates: false,
    collect: remoteok.collect,
  },
  {
    id: 'arbeitnow',
    label: 'Arbeitnow',
    reliability: 'stable',
    note: 'Public job-board API. EU-heavy, mix of remote/onsite.',
    paginates: true,
    collect: arbeitnow.collect,
  },
  {
    id: 'jobicy',
    label: 'Jobicy',
    reliability: 'stable',
    note: 'Public remote-jobs API with salary ranges.',
    paginates: false,
    collect: jobicy.collect,
  },
  {
    id: 'weworkremotely',
    label: 'We Work Remotely',
    reliability: 'stable',
    note: 'Official RSS feed (programming category).',
    paginates: false,
    collect: weworkremotely.collect,
  },
  {
    id: 'linkedin',
    label: 'LinkedIn',
    reliability: 'fragile',
    note: 'Best-effort guest scrape. Noisy & rate-limited — pair with the strict title filter.',
    paginates: true,
    collect: linkedin.collect,
  },
  {
    id: 'naukri',
    label: 'Naukri',
    reliability: 'fragile',
    note: 'Headless-browser scrape (India). Slower & ToS-exposed — pair with the strict title filter.',
    paginates: true,
    collect: naukri.collect,
  },
];

export const SOURCE_MAP = new Map(SOURCES.map((s) => [s.id, s]));

export function publicSourceList() {
  return SOURCES.map(({ id, label, reliability, note, paginates }) => ({
    id,
    label,
    reliability,
    note,
    paginates,
  }));
}
