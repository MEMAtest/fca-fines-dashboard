import { useEffect, useMemo, useRef, useState } from 'react';
import Fuse from 'fuse.js';
import { useDebounce } from '../hooks/useDebounce';
import { useLocalStorage } from '../hooks/useLocalStorage';

interface SearchAutocompleteProps {
  value: string;
  scope: string;
  data: Array<{ firm: string; summary: string; category: string }>;
  onScopeChange: (scope: string) => void;
  onChange: (value: string) => void;
}

const OPTIONS = [
  { value: 'all', label: 'All data' },
  { value: 'firm', label: 'Firms/individuals' },
  { value: 'summary', label: 'Final notice summary' },
  { value: 'category', label: 'Breach category' },
];

export function SearchAutocomplete({ value, scope, data, onScopeChange, onChange }: SearchAutocompleteProps) {
  const [open, setOpen] = useState(false);
  const debouncedValue = useDebounce(value, 200);
  const [recentSearches, setRecentSearches] = useLocalStorage<string[]>('fca-search-history', []);
  const inputRef = useRef<HTMLInputElement>(null);

  const fuse = useMemo(() => {
    return new Fuse(data, {
      keys: ['firm', 'summary', 'category'],
      threshold: 0.35,
      minMatchCharLength: 2,
    });
  }, [data]);

  const suggestions = useMemo(() => {
    if (!debouncedValue.trim()) return [];
    const results = fuse.search(debouncedValue).slice(0, 6);
    return results.map((result) => result.item);
  }, [debouncedValue, fuse]);

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    }
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, []);

  function addRecentSearch(text: string) {
    const term = text.trim();
    if (!term) return;
    setRecentSearches((prev) => {
      const next = [term, ...prev.filter((entry) => entry.toLowerCase() !== term.toLowerCase())];
      return next.slice(0, 6);
    });
  }

  function handleSelect(text: string) {
    onChange(text);
    addRecentSearch(text);
    setOpen(false);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      addRecentSearch(event.currentTarget.value);
      setOpen(false);
    }
  }

  function highlight(text: string) {
    const term = debouncedValue.trim();
    if (!term) return text;
    const regex = new RegExp(`(${escapeRegExp(term)})`, 'ig');
    const parts = text.split(regex);
    return (
      <>
        {parts.map((part, index) =>
          index % 2 === 1 ? (
            <mark key={`${part}-${index}`}>{part}</mark>
          ) : (
            <span key={`${part}-${index}`}>{part}</span>
          )
        )}
      </>
    );
  }

  return (
    <div className="search-autocomplete">
      <div className="search-autocomplete__scope">
        <select value={scope} onChange={(e) => onScopeChange(e.target.value)}>
          {OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      <div className="search-autocomplete__input">
        <input
          type="search"
          placeholder="Search firm, summary, keyword…"
          value={value}
          ref={inputRef}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          aria-label="Search fines (press ⌘K)"
        />
        {open && (suggestions.length > 0 || recentSearches.length > 0) && (
          <div className="search-autocomplete__dropdown">
            {suggestions.length > 0 && (
              <>
                <div className="search-autocomplete__dropdown-header">Matches</div>
                {suggestions.map((item) => (
                  <button key={`${item.firm}-${item.category}`} type="button" onMouseDown={() => handleSelect(item.firm)}>
                    <strong>{highlight(item.firm)}</strong>
                    <span>{item.category}</span>
                  </button>
                ))}
              </>
            )}
            {!debouncedValue.trim() && recentSearches.length > 0 && (
              <>
                <div className="search-autocomplete__dropdown-header">Recent searches</div>
                <div className="search-autocomplete__recent">
                  {recentSearches.map((recent) => (
                    <button key={recent} type="button" onMouseDown={() => handleSelect(recent)}>
                      {recent}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
