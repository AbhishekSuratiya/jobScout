import type { ReactNode } from 'react';
import type { Filters } from '../types';

const SKILL_PRESETS = [
  'React', 'React Native', 'TypeScript', 'JavaScript', 'Node.js',
  'Vue', 'Angular', 'Next.js', 'GraphQL', 'Python',
];

const FRESHNESS = [
  { label: 'Any time', value: '' },
  { label: 'Past 24 hours', value: '1' },
  { label: 'Past 3 days', value: '3' },
  { label: 'Past week', value: '7' },
  { label: 'Past month', value: '30' },
];

interface Props {
  filters: Filters;
  onChange: (patch: Partial<Filters>) => void;
}

export function FilterPanel({ filters: f, onChange }: Props) {
  const toggleSkill = (skill: string) => {
    const has = f.skills.includes(skill);
    onChange({ skills: has ? f.skills.filter((s) => s !== skill) : [...f.skills, skill] });
  };

  return (
    <div className="filters">
      <div className="filter-row">
        <Field label="Search keywords" hint="Sent to each portal's search">
          <input
            type="text"
            placeholder="e.g. react native developer"
            value={f.query}
            onChange={(e) => onChange({ query: e.target.value })}
          />
        </Field>

        <Field label="Location" hint="LinkedIn & Naukri only · blank = worldwide">
          <input
            type="text"
            placeholder="e.g. India"
            value={f.location}
            onChange={(e) => onChange({ location: e.target.value })}
          />
        </Field>
      </div>

      <Field
        label="Title must include"
        hint="Strict local filter — only keep jobs with these words in the TITLE"
        highlight
      >
        <input
          type="text"
          placeholder="e.g. react native"
          value={f.titleMustInclude}
          onChange={(e) => onChange({ titleMustInclude: e.target.value })}
        />
      </Field>

      <Field label="Skills" hint="Match anywhere in the posting">
        <div className="chips-input">
          {SKILL_PRESETS.map((s) => (
            <button
              key={s}
              type="button"
              className={`chip-toggle ${f.skills.includes(s) ? 'on' : ''}`}
              onClick={() => toggleSkill(s)}
            >
              {s}
            </button>
          ))}
        </div>
        {f.skills.length > 1 && (
          <label className="inline-radio">
            <span>Match</span>
            <select
              value={f.skillMatchMode}
              onChange={(e) => onChange({ skillMatchMode: e.target.value as 'any' | 'all' })}
            >
              <option value="any">any skill</option>
              <option value="all">all skills</option>
            </select>
          </label>
        )}
      </Field>

      <div className="filter-row">
        <Field label="Posted">
          <select value={f.postedWithinDays} onChange={(e) => onChange({ postedWithinDays: e.target.value })}>
            {FRESHNESS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Min salary (yr)">
          <input
            type="number"
            placeholder="e.g. 80000"
            value={f.salaryMin}
            onChange={(e) => onChange({ salaryMin: e.target.value })}
          />
        </Field>
      </div>

      <div className="filter-row">
        <Field label="Min experience (yrs)">
          <input
            type="number"
            min="0"
            placeholder="0"
            value={f.minYears}
            onChange={(e) => onChange({ minYears: e.target.value })}
          />
        </Field>
        <Field label="Max experience (yrs)">
          <input
            type="number"
            min="0"
            placeholder="any"
            value={f.maxYears}
            onChange={(e) => onChange({ maxYears: e.target.value })}
          />
        </Field>
      </div>

      <div className="filter-toggles">
        <label className="switch">
          <input
            type="checkbox"
            checked={f.remoteOnly}
            onChange={(e) => onChange({ remoteOnly: e.target.checked })}
          />
          <span>Remote only</span>
        </label>
        <label className="switch">
          <input
            type="checkbox"
            checked={f.category === 'frontend'}
            onChange={(e) => onChange({ category: e.target.checked ? 'frontend' : '' })}
          />
          <span>Frontend roles</span>
        </label>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  highlight,
  children,
}: {
  label: string;
  hint?: string;
  highlight?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`field ${highlight ? 'field-highlight' : ''}`}>
      <label className="field-label">{label}</label>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </div>
  );
}
