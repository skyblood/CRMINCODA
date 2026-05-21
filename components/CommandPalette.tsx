import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Search, X, Briefcase, FolderKanban, Users, Package, DollarSign, Clock, ArrowRight, History, Trash2 } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';

interface SearchResult {
  id: string;
  title: string;
  subtitle?: string;
  badge?: string;
  icon: string;
  route: string;
  collectionType: string;
}

interface SearchResults {
  leads?: SearchResult[];
  projects?: SearchResult[];
  contacts?: SearchResult[];
  skus?: SearchResult[];
  transactions?: SearchResult[];
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

interface HistoryEntry {
  term: string;
  ts: number;
}

const HISTORY_KEY = 'CRM_SEARCH_HISTORY';
const MAX_HISTORY = 5;

const ICON_MAP: Record<string, React.ComponentType<any>> = {
  Briefcase,
  FolderKanban,
  Users,
  Package,
  DollarSign,
};

const COLLECTION_LABELS: Record<string, string> = {
  leads: 'Leads',
  projects: 'Projects',
  contacts: 'Contacts',
  skus: 'Products & SKUs',
  transactions: 'Transactions',
};

const BADGE_COLORS: Record<string, string> = {
  prospect: 'bg-gray-100 text-gray-600',
  qualification: 'bg-blue-100 text-blue-700',
  presentation: 'bg-purple-100 text-purple-700',
  proposal: 'bg-yellow-100 text-yellow-700',
  negotiation: 'bg-orange-100 text-orange-700',
  'closed-won': 'bg-green-100 text-green-700',
  'closed-lost': 'bg-red-100 text-red-700',
  active: 'bg-green-100 text-green-700',
  completed: 'bg-gray-100 text-gray-600',
  'on-hold': 'bg-yellow-100 text-yellow-700',
  income: 'bg-green-100 text-green-700',
  expense: 'bg-red-100 text-red-700',
};

function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveHistoryEntry(term: string): void {
  const trimmed = term.trim();
  if (!trimmed) return;
  const history = loadHistory().filter((h) => h.term !== trimmed);
  history.unshift({ term: trimmed, ts: Date.now() });
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, MAX_HISTORY)));
}

export function CommandPalette({ isOpen, onClose }: Props) {
  const navigate = useNavigate();
  const location = useLocation();

  // Close modal on route change (e.g. sidebar navigation while modal is open)
  useEffect(() => {
    if (isOpen) onClose();
  }, [location.pathname]); // eslint-disable-line react-hooks/exhaustive-deps
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResults>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setResults({});
      setError(null);
      setSelectedIndex(0);
      setHistory(loadHistory());
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const flatResults: SearchResult[] = Object.values(results).flat();

  const doSearch = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults({});
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&limit=5`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const data: SearchResults = json.results ?? json;
      setResults(data);
      setSelectedIndex(0);
    } catch (e: any) {
      setError('Search failed. Please try again.');
      setResults({});
    } finally {
      setLoading(false);
    }
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (val.length < 2) {
      setResults({});
      setLoading(false);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(() => doSearch(val), 300);
  };

  const handleSelect = (result: SearchResult) => {
    saveHistoryEntry(result.title);
    setHistory(loadHistory());
    navigate(result.route);
    onClose();
  };

  const handleHistorySelect = (term: string) => {
    setQuery(term);
    doSearch(term);
  };

  const clearHistory = () => {
    localStorage.removeItem(HISTORY_KEY);
    setHistory([]);
  };

  const removeFromHistory = (term: string) => {
    const updated = loadHistory().filter((h) => h.term !== term);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
    setHistory(updated);
  };

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, flatResults.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        if (flatResults[selectedIndex]) handleSelect(flatResults[selectedIndex]);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, flatResults, selectedIndex]);

  // Global Cmd+K / Ctrl+K
  useEffect(() => {
    const handleGlobal = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (!isOpen) {
          // parent controls isOpen; do nothing here — App.tsx should handle
        }
      }
    };
    window.addEventListener('keydown', handleGlobal);
    return () => window.removeEventListener('keydown', handleGlobal);
  }, [isOpen]);

  if (!isOpen) return null;

  const hasResults = Object.values(results).some((arr) => arr && arr.length > 0);
  const showHistory = query.length === 0;

  let globalIdx = 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-2xl flex flex-col overflow-hidden"
        style={{ maxHeight: '80vh' }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 p-4 border-b border-gray-100">
          <Search size={18} className="text-gray-400 flex-shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={handleInputChange}
            placeholder="Search leads, projects, contacts..."
            className="flex-1 outline-none text-gray-800 placeholder-gray-400 text-sm bg-transparent"
          />
          <div className="flex items-center gap-2">
            <span className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 bg-gray-100 rounded text-xs text-gray-500 font-mono">⌘K</span>
            <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-md transition-colors">
              <X size={16} className="text-gray-400" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div ref={listRef} className="overflow-y-auto flex-1">
          {/* Loading skeletons */}
          {loading && (
            <div className="p-4 space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-3 px-2">
                  <div className="animate-pulse bg-gray-100 rounded h-8 w-8 flex-shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="animate-pulse bg-gray-100 rounded h-4 w-3/4" />
                    <div className="animate-pulse bg-gray-100 rounded h-3 w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Error */}
          {!loading && error && (
            <div className="p-6 text-center text-sm text-red-500">{error}</div>
          )}

          {/* Recent Searches */}
          {!loading && showHistory && history.length > 0 && (
            <div>
              <div className="flex items-center justify-between px-4 py-2">
                <span className="text-xs uppercase text-gray-400 font-semibold tracking-wide">Recent Searches</span>
                <button onClick={clearHistory} className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1">
                  <Trash2 size={12} /> Clear all
                </button>
              </div>
              {history.map((h) => (
                <div
                  key={h.term}
                  className="flex items-center justify-between px-4 py-2 hover:bg-gray-50 cursor-pointer group"
                  onClick={() => handleHistorySelect(h.term)}
                >
                  <div className="flex items-center gap-3">
                    <History size={14} className="text-gray-400" />
                    <span className="text-sm text-gray-700">{h.term}</span>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); removeFromHistory(h.term); }}
                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-200 rounded transition-all"
                  >
                    <X size={12} className="text-gray-400" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* No results */}
          {!loading && !showHistory && !error && !hasResults && query.length >= 2 && (
            <div className="p-8 text-center text-sm text-gray-400">No results for "{query}"</div>
          )}

          {/* Results grouped by collection */}
          {!loading && hasResults && (
            <div>
              {(Object.keys(COLLECTION_LABELS) as Array<keyof SearchResults>).map((collection) => {
                const items = results[collection];
                if (!items || items.length === 0) return null;
                return (
                  <div key={collection}>
                    <div className="px-4 py-2 text-xs uppercase text-gray-400 font-semibold tracking-wide bg-gray-50/50">
                      {COLLECTION_LABELS[collection]}
                    </div>
                    {items.map((item) => {
                      const currentIdx = globalIdx++;
                      const isSelected = currentIdx === selectedIndex;
                      const IconComp = ICON_MAP[item.icon] || Briefcase;
                      const badgeColor = item.badge ? (BADGE_COLORS[item.badge.toLowerCase()] || 'bg-gray-100 text-gray-600') : null;
                      return (
                        <div
                          key={item.id}
                          onClick={() => handleSelect(item)}
                          className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors ${
                            isSelected
                              ? 'bg-purple-50'
                              : 'hover:bg-purple-50/30'
                          }`}
                        >
                          <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                            <IconComp size={15} className="text-gray-500" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-gray-800 truncate">{item.title}</div>
                            {item.subtitle && (
                              <div className="text-xs text-gray-400 truncate">{item.subtitle}</div>
                            )}
                          </div>
                          {item.badge && badgeColor && (
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${badgeColor}`}>
                              {item.badge}
                            </span>
                          )}
                          {isSelected && <ArrowRight size={14} className="text-gray-400 flex-shrink-0" />}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}

          {/* Empty state for history */}
          {!loading && showHistory && history.length === 0 && (
            <div className="p-8 text-center text-sm text-gray-400">
              Type to search leads, projects, contacts and more...
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-gray-100 bg-gray-50/50 flex items-center gap-4 text-xs text-gray-400">
          <span className="flex items-center gap-1"><kbd className="font-mono">↑↓</kbd> Navigate</span>
          <span className="flex items-center gap-1"><kbd className="font-mono">↵</kbd> Open</span>
          <span className="flex items-center gap-1"><kbd className="font-mono">Esc</kbd> Close</span>
        </div>
      </div>
    </div>
  );
}
