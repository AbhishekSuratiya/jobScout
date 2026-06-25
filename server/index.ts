import express from 'express';
import cors from 'cors';
import type { SearchParams, CollectorResult, SearchResponse, Job, CollectContext } from './types.ts';
import { SOURCE_MAP, publicSourceList } from './sources/index.ts';
import { applyFilters, sortByFreshness, dedupe } from './filters.ts';

const app = express();
app.use(cors());
app.use(express.json());

// Use a dedicated var (not PORT) so a parent process/harness that injects PORT
// for the Vite dev server can't accidentally collide the API onto Vite's port.
// The Vite proxy in vite.config.ts targets 5174, so keep this in sync.
const PORT = Number(process.env.API_PORT) || 5174;

// Tiny in-memory cache so repeated searches within a few minutes don't re-hit
// each source (politeness + speed). Keyed per source id.
const cache = new Map<string, { at: number; jobs: Job[] }>();
const CACHE_MS = 5 * 60 * 1000;

async function collectSource(
  id: string,
  query: string,
  page: number,
  ctx: CollectContext,
): Promise<{ jobs: Job[]; result: CollectorResult }> {
  const meta = SOURCE_MAP.get(id);
  if (!meta) return { jobs: [], result: { source: id, ok: false, count: 0, error: 'unknown source' } };

  const cacheKey = `${id}::${query}::${page}::${ctx.location}::${ctx.postedWithinDays}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_MS) {
    return { jobs: cached.jobs, result: { source: id, ok: true, count: cached.jobs.length } };
  }

  try {
    const jobs = await meta.collect(query, page, ctx);
    cache.set(cacheKey, { at: Date.now(), jobs });
    return { jobs, result: { source: id, ok: true, count: jobs.length } };
  } catch (err) {
    // Per-source isolation: one broken site never kills the run.
    return {
      jobs: [],
      result: { source: id, ok: false, count: 0, error: err instanceof Error ? err.message : String(err) },
    };
  }
}

app.get('/api/sources', (_req, res) => {
  res.json(publicSourceList());
});

app.post('/api/search', async (req, res) => {
  const p = normalizeParams(req.body);
  if (!p.sources.length) {
    res.status(400).json({ error: 'Select at least one source.' });
    return;
  }

  // Scrapers (LinkedIn/Naukri) can't list "all jobs" — they need a search term.
  // If the keyword box is empty, fall back to the skills, then the title filter,
  // so an empty search doesn't silently default to one hardcoded keyword.
  const effectiveQuery = p.query || p.skills.join(' ') || p.titleMustInclude.join(' ');

  // Context for location-based boards (LinkedIn/Naukri) to scope + time-filter.
  const ctx: CollectContext = { location: p.location, postedWithinDays: p.postedWithinDays };

  // Fetch all selected sources in parallel for the requested page.
  const settled = await Promise.all(p.sources.map((id) => collectSource(id, effectiveQuery, p.page, ctx)));

  const rawJobs = settled.flatMap((s) => s.jobs);
  const collectors = settled.map((s) => s.result);

  const filtered = applyFilters(rawJobs, p);
  const jobs = sortByFreshness(dedupe(filtered));

  const response: SearchResponse = { jobs, collectors, total: jobs.length };
  res.json(response);
});

function normalizeParams(body: Record<string, unknown>): SearchParams {
  const arr = (v: unknown): string[] =>
    Array.isArray(v) ? v.map(String).filter(Boolean) : typeof v === 'string' && v ? [v] : [];
  const num = (v: unknown): number | null => {
    const n = Number(v);
    return v === '' || v == null || Number.isNaN(n) ? null : n;
  };
  return {
    sources: arr(body.sources),
    query: typeof body.query === 'string' ? body.query : '',
    location: typeof body.location === 'string' ? body.location.trim() : '',
    titleMustInclude: arr(body.titleMustInclude),
    skills: arr(body.skills),
    skillMatchMode: body.skillMatchMode === 'all' ? 'all' : 'any',
    remoteOnly: !!body.remoteOnly,
    salaryMin: num(body.salaryMin),
    postedWithinDays: num(body.postedWithinDays),
    minYears: num(body.minYears),
    maxYears: num(body.maxYears),
    category: typeof body.category === 'string' && body.category ? body.category : null,
    page: Math.max(1, Number(body.page) || 1),
  };
}

app.listen(PORT, () => {
  console.log(`[job-search] API listening on http://localhost:${PORT}`);
});
