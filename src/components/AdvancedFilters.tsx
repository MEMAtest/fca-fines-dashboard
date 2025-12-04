import { useEffect, useMemo, useState } from 'react';
import { useLocalStorage } from '../hooks/useLocalStorage';

export interface AdvancedFilterValues {
  years: number[];
  amountRange: [number, number];
  breachTypes: string[];
  firmCategories: string[];
  dateRange: { start: string; end: string };
}

interface AdvancedFiltersProps {
  open: boolean;
  availableYears: number[];
  breachOptions: string[];
  firmOptions: string[];
  values: AdvancedFilterValues;
  currentYear: number;
  onApply: (values: AdvancedFilterValues) => void;
  onClose: () => void;
  onClear: () => void;
}

const AMOUNT_MAX = 500_000_000;
const MAX_PRESETS = 6;

interface SavedPreset {
  id: string;
  name: string;
  values: AdvancedFilterValues;
}

interface QuickPreset {
  id: string;
  label: string;
  description: string;
  apply: (draft: AdvancedFilterValues) => AdvancedFilterValues;
}

function buildQuickPresets(currentYear: number, availableYears: number[]): QuickPreset[] {
  const yearsSlice = availableYears.slice(0, 3);
  const last12Start = new Date();
  last12Start.setFullYear(last12Start.getFullYear() - 1);
  const isoStart = last12Start.toISOString().slice(0, 10);
  const todayIso = new Date().toISOString().slice(0, 10);
  return [
    {
      id: 'focus',
      label: 'Current year',
      description: 'Focus entirely on the active year.',
      apply: (draft) => ({ ...draft, years: [currentYear], dateRange: { start: '', end: '' } }),
    },
    {
      id: 'recent',
      label: 'Last 3 years',
      description: `Quickly view ${yearsSlice.join(', ')} data.`,
      apply: (draft) => ({ ...draft, years: yearsSlice }),
    },
    {
      id: 'high-penalty',
      label: '£10m+ penalties',
      description: 'Highlight major enforcement activity.',
      apply: (draft) => ({ ...draft, amountRange: [10_000_000, AMOUNT_MAX] }),
    },
    {
      id: 'last-year',
      label: 'Last 12 months',
      description: 'Rolling 12-month cadence.',
      apply: (draft) => ({ ...draft, dateRange: { start: isoStart, end: todayIso } }),
    },
    {
      id: 'reset',
      label: 'Reset filters',
      description: 'Clear all advanced controls.',
      apply: () => ({
        years: [],
        amountRange: [0, AMOUNT_MAX],
        breachTypes: [],
        firmCategories: [],
        dateRange: { start: '', end: '' },
      }),
    },
  ];
}

export function AdvancedFilters({
  open,
  availableYears,
  breachOptions,
  firmOptions,
  values,
  currentYear,
  onApply,
  onClose,
  onClear,
}: AdvancedFiltersProps) {
  const [draft, setDraft] = useState(values);
  const [savedPresets, setSavedPresets] = useLocalStorage<SavedPreset[]>('fca-filter-presets', []);
  const quickPresets = useMemo(() => buildQuickPresets(currentYear, availableYears), [currentYear, availableYears]);

  useEffect(() => {
    setDraft(values);
  }, [values]);

  function toggleValue(list: number[], value: number) {
    return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
  }

  function toggleStringValue(list: string[], value: string) {
    return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
  }

  function applyChanges() {
    onApply(draft);
    onClose();
  }

  function handleSavePreset() {
    const name = window.prompt('Name this preset');
    if (!name) return;
    const generatedId =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : String(Date.now());
    const snapshot: AdvancedFilterValues = {
      years: [...draft.years],
      amountRange: [draft.amountRange[0], draft.amountRange[1]],
      breachTypes: [...draft.breachTypes],
      firmCategories: [...draft.firmCategories],
      dateRange: { ...draft.dateRange },
    };
    const preset: SavedPreset = {
      id: generatedId,
      name,
      values: snapshot,
    };
    setSavedPresets((prev) => [preset, ...prev].slice(0, MAX_PRESETS));
  }

  function applyPreset(valuesToApply: AdvancedFilterValues) {
    setDraft(valuesToApply);
  }

  function deletePreset(id: string) {
    setSavedPresets((prev) => prev.filter((preset) => preset.id !== id));
  }

  if (!open) return null;

  return (
    <div className="advanced-overlay" role="dialog" aria-modal="true">
      <div className="advanced-panel">
        <header>
          <div>
            <p className="panel__eyebrow">Advanced filters</p>
            <h3>Slice enforcement trends your way</h3>
            <p className="panel__description">Apply quick presets, save views for later, and use the dual sliders to zero-in on precise amounts.</p>
          </div>
          <div className="advanced-panel__actions">
            <button type="button" onClick={onClear} className="btn btn-link">
              Clear all
            </button>
            <button type="button" onClick={onClose} className="btn btn-ghost">
              Close
            </button>
            <button type="button" onClick={applyChanges} className="btn btn-primary">
              Apply
            </button>
          </div>
        </header>
        <div className="advanced-grid" aria-live="polite">
          <section>
            <h4>Quick presets</h4>
            <div className="advanced-panel__presets">
              {quickPresets.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className="preset-btn"
                  onClick={() => setDraft((prev) => preset.apply(prev))}
                >
                  <span>{preset.label}</span>
                  <small>{preset.description}</small>
                </button>
              ))}
            </div>
          </section>
          <section>
            <div className="preset-header">
              <h4>Saved presets</h4>
              <button type="button" className="btn btn-ghost btn--compact" onClick={handleSavePreset}>
                Save current
              </button>
            </div>
            {savedPresets.length === 0 ? (
              <p className="status">No saved presets yet—capture frequently used combinations here.</p>
            ) : (
              <div className="preset-list">
                {savedPresets.map((preset) => (
                  <article key={preset.id} className="preset-card">
                    <div>
                      <strong>{preset.name}</strong>
                      <p>{preset.values.years.length ? `Years: ${preset.values.years.join(', ')}` : 'All years'}</p>
                    </div>
                    <div className="preset-card__actions">
                      <button type="button" className="btn btn-ghost btn--compact" onClick={() => applyPreset(preset.values)}>
                        Apply
                      </button>
                      <button type="button" className="btn btn-link btn--compact" onClick={() => deletePreset(preset.id)}>
                        Remove
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
          <section>
            <h4>Years</h4>
            <div className="chip-grid">
              {availableYears.map((year) => (
                <button
                  key={year}
                  type="button"
                  className={draft.years.includes(year) ? 'chip chip--active' : 'chip'}
                  onClick={() => setDraft((prev) => ({ ...prev, years: toggleValue(prev.years, year) }))}
                >
                  {year}
                </button>
              ))}
            </div>
          </section>
          <section>
            <h4>Amount range</h4>
            <div className="amount-slider">
              <label>
                Min (£)
                <input
                  type="number"
                  value={draft.amountRange[0]}
                  min={0}
                  max={draft.amountRange[1]}
                  onChange={(e) =>
                    setDraft((prev) => ({
                      ...prev,
                      amountRange: [Math.min(Number(e.target.value), prev.amountRange[1]), prev.amountRange[1]],
                    }))
                  }
                />
              </label>
              <label>
                Max (£)
                <input
                  type="number"
                  value={draft.amountRange[1]}
                  min={draft.amountRange[0]}
                  max={AMOUNT_MAX}
                  onChange={(e) =>
                    setDraft((prev) => ({
                      ...prev,
                      amountRange: [prev.amountRange[0], Math.max(Number(e.target.value), prev.amountRange[0])],
                    }))
                  }
                />
              </label>
            </div>
            <div className="amount-slider__ranges">
              <input
                type="range"
                min={0}
                max={AMOUNT_MAX}
                value={draft.amountRange[0]}
                aria-label="Minimum amount slider"
                onChange={(e) =>
                  setDraft((prev) => ({
                    ...prev,
                    amountRange: [Math.min(Number(e.target.value), prev.amountRange[1]), prev.amountRange[1]],
                  }))
                }
              />
              <input
                type="range"
                min={0}
                max={AMOUNT_MAX}
                value={draft.amountRange[1]}
                aria-label="Maximum amount slider"
                onChange={(e) =>
                  setDraft((prev) => ({
                    ...prev,
                    amountRange: [prev.amountRange[0], Math.max(Number(e.target.value), prev.amountRange[0])],
                  }))
                }
              />
            </div>
            <div className="amount-slider__values">
              <span>£{(draft.amountRange[0] / 1_000_000).toFixed(1)}m</span>
              <span>{draft.amountRange[1] >= AMOUNT_MAX ? '£500m+' : `£${(draft.amountRange[1] / 1_000_000).toFixed(1)}m`}</span>
            </div>
          </section>
          <section>
            <h4>Breach types</h4>
            <div className="chip-grid">
              {breachOptions.map((option) => (
                <button
                  key={option}
                  type="button"
                  className={draft.breachTypes.includes(option) ? 'chip chip--active' : 'chip'}
                  onClick={() => setDraft((prev) => ({ ...prev, breachTypes: toggleStringValue(prev.breachTypes, option) }))}
                >
                  {option}
                </button>
              ))}
            </div>
          </section>
          <section>
            <h4>Firm categories</h4>
            <div className="chip-grid">
              {firmOptions.map((option) => (
                <button
                  key={option}
                  type="button"
                  className={draft.firmCategories.includes(option) ? 'chip chip--active' : 'chip'}
                  onClick={() =>
                    setDraft((prev) => ({ ...prev, firmCategories: toggleStringValue(prev.firmCategories, option) }))
                  }
                >
                  {option}
                </button>
              ))}
            </div>
          </section>
          <section>
            <h4>Date range</h4>
            <div className="date-range">
              <label>
                Start
                <input
                  type="date"
                  value={draft.dateRange.start}
                  onChange={(e) => setDraft((prev) => ({ ...prev, dateRange: { ...prev.dateRange, start: e.target.value } }))}
                />
              </label>
              <label>
                End
                <input
                  type="date"
                  value={draft.dateRange.end}
                  onChange={(e) => setDraft((prev) => ({ ...prev, dateRange: { ...prev.dateRange, end: e.target.value } }))}
                />
              </label>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
