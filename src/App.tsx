import { useEffect, useMemo, useState } from 'react';
import type { Filters, SourceMeta, SourceResult } from './types';
import { fetchSources, searchJobs } from './api';
import { SourceSelector } from './components/SourceSelector';
import { FilterPanel } from './components/FilterPanel';
import { ResultsTabs } from './components/ResultsTabs';
import './App.css';

const DEFAULT_FILTERS: Filters = {
  query: '',
  location: '',
  titleMustInclude: '',
  skills: [],
  skillMatchMode: 'any',
  remoteOnly: false,
  salaryMin: '',
  postedWithinDays: '',
  minYears: '',
  maxYears: '',
  category: '',
};

function App() {
  const [sources, setSources] = useState<SourceMeta[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  // One result bucket per source (each becomes a tab/section).
  const [results, setResults] = useState<Record<string, SourceResult>>({});
  const [order, setOrder] = useState<string[]>([]); // which sources were searched, in order
  const [activeTab, setActiveTab] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  // Load portal list once; default-select the stable ones.
  useEffect(() => {
    fetchSources()
      .then((list) => {
        setSources(list);
        // No portals selected by default — the user picks from the row.
      })
      .catch((e) => setError(e.message));
  }, []);

  const sourceMeta = useMemo(() => new Map(sources.map((s) => [s.id, s])), [sources]);

  const toggleSource = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const patchFilters = (patch: Partial<Filters>) => setFilters((f) => ({ ...f, ...patch }));

  // Did this source's page have more raw results to page through?
  const computeHasMore = (id: string, rawCount: number) =>
    !!sourceMeta.get(id)?.paginates && rawCount > 0;

  const runSearch = async () => {
    if (selected.size === 0) {
      setError('Pick at least one job portal.');
      return;
    }
    setError(null);
    setSearched(true);

    // Keep portals in the registry's order for stable tabs.
    const ids = sources.map((s) => s.id).filter((id) => selected.has(id));
    setOrder(ids);
    setActiveTab(ids[0]);
    setResults(
      Object.fromEntries(
        ids.map((id) => [id, { jobs: [], page: 0, hasMore: false, loading: true, error: null }]),
      ),
    );

    // Fetch page 1 of every selected source in parallel; fill tabs as they land.
    await Promise.all(
      ids.map(async (id) => {
        try {
          const res = await searchJobs([id], filters, 1);
          const raw = res.collectors[0]?.count ?? 0;
          const collectorErr = res.collectors[0]?.ok === false ? res.collectors[0].error ?? 'failed' : null;
          setResults((prev) => ({
            ...prev,
            [id]: {
              jobs: res.jobs,
              page: 1,
              hasMore: computeHasMore(id, raw),
              loading: false,
              error: collectorErr,
            },
          }));
        } catch (e) {
          setResults((prev) => ({
            ...prev,
            [id]: { jobs: [], page: 1, hasMore: false, loading: false, error: msg(e) },
          }));
        }
      }),
    );
  };

  const loadMore = async (id: string) => {
    const current = results[id];
    if (!current || current.loading || !current.hasMore) return;
    setResults((prev) => ({ ...prev, [id]: { ...prev[id], loading: true } }));
    const nextPage = current.page + 1;
    try {
      const res = await searchJobs([id], filters, nextPage);
      const raw = res.collectors[0]?.count ?? 0;
      setResults((prev) => {
        const seen = new Set(prev[id].jobs.map((j) => j.id));
        const fresh = res.jobs.filter((j) => !seen.has(j.id));
        return {
          ...prev,
          [id]: {
            jobs: [...prev[id].jobs, ...fresh],
            page: nextPage,
            // Stop if the page brought nothing new (e.g. source ran out).
            hasMore: computeHasMore(id, raw) && fresh.length > 0,
            loading: false,
            error: null,
          },
        };
      });
    } catch (e) {
      setResults((prev) => ({ ...prev, [id]: { ...prev[id], loading: false, error: msg(e) } }));
    }
  };

  const totalJobs = order.reduce((n, id) => n + (results[id]?.jobs.length ?? 0), 0);
  const anyLoading = order.some((id) => results[id]?.loading);

  return (
    <div className="app">
      <header className="app-header">
        <h1>JobScout</h1>
        <p>Search multiple job boards at once, then filter down to the roles that actually match.</p>
      </header>

      <div className="controls">
        <SourceSelector sources={sources} selected={selected} onToggle={toggleSource} />
        <FilterPanel filters={filters} onChange={patchFilters} />
        <button type="button" className="search-btn" onClick={runSearch} disabled={anyLoading}>
          {anyLoading ? 'Scraping…' : 'Search jobs'}
        </button>
      </div>

      <main className="results">
        {error && <div className="banner error">{error}</div>}

        {searched && (
          <div className="results-summary">
            <strong>{totalJobs}</strong> {totalJobs === 1 ? 'job' : 'jobs'} across {order.length}{' '}
            {order.length === 1 ? 'portal' : 'portals'}
          </div>
        )}

        <ResultsTabs
          order={order}
          sourceMeta={sourceMeta}
          results={results}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          onLoadMore={loadMore}
        />
      </main>
    </div>
  );
}

function msg(e: unknown): string {
  return e instanceof Error ? e.message : 'Request failed';
}

export default App;
