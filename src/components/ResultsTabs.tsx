import { useEffect, useRef } from 'react';
import type { SourceMeta, SourceResult } from '../types';
import { JobCard } from './JobCard';

interface Props {
  // selected source ids, in display order
  order: string[];
  sourceMeta: Map<string, SourceMeta>;
  results: Record<string, SourceResult>;
  activeTab: string;
  onTabChange: (id: string) => void;
  onLoadMore: (id: string) => void;
}

// One tab per job portal, each with its own results and infinite scroll.
export function ResultsTabs({ order, sourceMeta, results, activeTab, onTabChange, onLoadMore }: Props) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const active = results[activeTab];

  // Infinite scroll: load the next page of the active tab when the sentinel
  // at the bottom of the list scrolls into view.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !active) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && active.hasMore && !active.loading) {
          onLoadMore(activeTab);
        }
      },
      { rootMargin: '300px' },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [activeTab, active, onLoadMore]);

  if (order.length === 0) return null;

  return (
    <div className="results-tabs">
      <div className="tab-bar" role="tablist">
        {order.map((id) => {
          const r = results[id];
          const meta = sourceMeta.get(id);
          return (
            <button
              key={id}
              role="tab"
              className={`tab ${id === activeTab ? 'active' : ''}`}
              onClick={() => onTabChange(id)}
            >
              {meta?.reliability === 'fragile' && <span className="tab-dot" title="fragile source" />}
              {meta?.label ?? id}
              <span className="tab-count">{r ? r.jobs.length : 0}</span>
              {r?.loading && <span className="tab-spinner" />}
            </button>
          );
        })}
      </div>

      {active && (
        <div className="tab-panel" role="tabpanel">
          {active.error && <div className="banner error">{active.error}</div>}

          {!active.loading && active.jobs.length === 0 && !active.error && (
            <div className="empty">
              No matching jobs from {sourceMeta.get(activeTab)?.label ?? activeTab}. Try adjusting filters.
            </div>
          )}

          <div className="job-list">
            {active.jobs.map((job) => (
              <JobCard key={job.id} job={job} />
            ))}
          </div>

          {/* sentinel + status line */}
          <div ref={sentinelRef} className="scroll-sentinel">
            {active.loading && <span className="muted">Loading more…</span>}
            {!active.loading && active.hasMore && (
              <button type="button" className="load-more" onClick={() => onLoadMore(activeTab)}>
                Load more
              </button>
            )}
            {!active.loading && !active.hasMore && active.jobs.length > 0 && (
              <span className="muted">End of results from {sourceMeta.get(activeTab)?.label}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
