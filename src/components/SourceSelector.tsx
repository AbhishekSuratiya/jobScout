import type { SourceMeta } from '../types';

interface Props {
  sources: SourceMeta[];
  selected: Set<string>;
  onToggle: (id: string) => void;
}

// Horizontal row of job portals shown directly on the page. Click to
// select/deselect which boards to scrape. Nothing is selected by default.
export function SourceSelector({ sources, selected, onToggle }: Props) {
  return (
    <div className="source-picker">
      <div className="source-picker-head">
        <span className="field-label">Job portals</span>
        <span className="field-hint">Pick which boards to search</span>
      </div>
      <div className="source-cards">
        {sources.map((s) => {
          const on = selected.has(s.id);
          return (
            <button
              key={s.id}
              type="button"
              className={`source-card ${on ? 'on' : ''}`}
              aria-pressed={on}
              onClick={() => onToggle(s.id)}
              title={s.note}
            >
              <span className="source-card-label">{s.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
