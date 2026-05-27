import { useState, useEffect, useCallback } from 'react';
import { listWidgets } from '../services/api';

const TYPE_COLORS = {
  banner:        'bg-blue-500/10 text-blue-400 border-blue-500/20',
  carousel:      'bg-purple-500/10 text-purple-400 border-purple-500/20',
  grid:          'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
  offer_strip:   'bg-orange-500/10 text-orange-400 border-orange-500/20',
  category_row:  'bg-teal-500/10 text-teal-400 border-teal-500/20',
  hero:          'bg-pink-500/10 text-pink-400 border-pink-500/20',
};

function TypeBadge({ type }) {
  const cls = TYPE_COLORS[type] || 'bg-gray-800 text-gray-400 border-gray-700';
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium border ${cls}`}>
      {type || '—'}
    </span>
  );
}

function EnvBadge({ env }) {
  const map = {
    PROD: 'bg-green-500/10 text-green-400 border-green-500/20',
    UAT:  'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
    DEV:  'bg-gray-800 text-gray-400 border-gray-700',
  };
  const cls = map[env] || map.DEV;
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium border ${cls}`}>
      {env || '—'}
    </span>
  );
}

function StatusDot({ status }) {
  const map = {
    active:   'bg-green-400',
    inactive: 'bg-gray-500',
    draft:    'bg-yellow-400',
    archived: 'bg-red-400',
  };
  return (
    <span className="flex items-center gap-1.5">
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${map[status] || 'bg-gray-500'}`} />
      <span className="text-gray-300 text-xs">{status || '—'}</span>
    </span>
  );
}

function formatDate(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  if (isNaN(d)) return ts;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function WidgetsTab() {
  const [widgets, setWidgets]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [envFilter, setEnvFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [search, setSearch]     = useState('');

  const fetchWidgets = useCallback(async () => {
    setLoading(true);
    const result = await listWidgets();
    if (result.error) {
      setError(result.error);
    } else {
      setWidgets(result.widgets || result || []);
      setError('');
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchWidgets(); }, [fetchWidgets]);

  const envs   = ['all', ...new Set(widgets.map(w => w.env).filter(Boolean))];
  const types  = ['all', ...new Set(widgets.map(w => w.type).filter(Boolean))];

  const filtered = widgets.filter(w => {
    if (envFilter !== 'all' && w.env !== envFilter) return false;
    if (typeFilter !== 'all' && w.type !== typeFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        (w.slug || '').toLowerCase().includes(q) ||
        (w.title || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-gray-100 font-semibold text-sm">Widgets</h2>
          <p className="text-gray-500 text-xs mt-0.5">
            {filtered.length} of {widgets.length} total
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Search */}
          <div className="relative">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search slug / title..."
              className="pl-8 pr-3 py-1.5 bg-gray-900 border border-gray-700 rounded-lg text-gray-200 text-xs focus:border-blue-500 focus:outline-none w-44"
            />
          </div>

          {/* Env filter */}
          <select value={envFilter} onChange={e => setEnvFilter(e.target.value)}
            className="px-3 py-1.5 bg-gray-900 border border-gray-700 rounded-lg text-gray-200 text-xs focus:border-blue-500 focus:outline-none">
            {envs.map(e => <option key={e} value={e}>{e === 'all' ? 'All Envs' : e}</option>)}
          </select>

          {/* Type filter */}
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
            className="px-3 py-1.5 bg-gray-900 border border-gray-700 rounded-lg text-gray-200 text-xs focus:border-blue-500 focus:outline-none">
            {types.map(t => <option key={t} value={t}>{t === 'all' ? 'All Types' : t}</option>)}
          </select>

          {/* Refresh */}
          <button onClick={fetchWidgets}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs rounded-lg transition-colors">
            <svg className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h5M20 20v-5h-5M4 9a9 9 0 0114.1-4.1M20 15a9 9 0 01-14.1 4.1" />
            </svg>
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg flex items-start gap-2">
          <svg className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
          <p className="text-red-400 text-sm">{error} &mdash; Widgets API may not be implemented yet.</p>
        </div>
      )}

      {/* Table */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800">
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wide">Slug</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wide">Title</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wide">Type</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wide">Env</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wide">Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wide">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center">
                  <svg className="animate-spin h-5 w-5 text-blue-400 mx-auto" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-500 text-sm">
                  {widgets.length === 0
                    ? 'No widgets found. Widgets are loaded from BigQuery.'
                    : 'No widgets match the current filters.'}
                </td>
              </tr>
            ) : filtered.map((w, i) => (
              <tr key={w.slug || i} className="hover:bg-gray-800/40 transition-colors">
                <td className="px-4 py-3">
                  <span className="font-mono text-xs text-blue-300">{w.slug}</span>
                </td>
                <td className="px-4 py-3">
                  <span className="text-gray-200 text-xs">{w.title || '—'}</span>
                </td>
                <td className="px-4 py-3">
                  <TypeBadge type={w.type} />
                </td>
                <td className="px-4 py-3">
                  <EnvBadge env={w.env} />
                </td>
                <td className="px-4 py-3">
                  <StatusDot status={w.status} />
                </td>
                <td className="px-4 py-3 text-gray-500 text-xs">
                  {formatDate(w.created_at || w.created)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
