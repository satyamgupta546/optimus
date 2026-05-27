import { useState, useEffect, useRef, useCallback } from 'react';
import { listAudit } from '../services/api';

const ACTION_COLORS = {
  create_widget:   'text-green-400',
  update_widget:   'text-blue-400',
  delete_widget:   'text-red-400',
  publish_widget:  'text-purple-400',
  rollback_widget: 'text-yellow-400',
  login:           'text-gray-400',
  logout:          'text-gray-400',
};

function StatusBadge({ status }) {
  const map = {
    success: 'bg-green-500/10 text-green-400 border-green-500/20',
    error:   'bg-red-500/10 text-red-400 border-red-500/20',
    denied:  'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  };
  const cls = map[status] || 'bg-gray-800 text-gray-400 border-gray-700';
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium border ${cls}`}>
      {status}
    </span>
  );
}

function formatTs(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  if (isNaN(d)) return ts;
  return d.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  });
}

const ALL_ACTIONS = [
  'create_widget', 'update_widget', 'delete_widget',
  'publish_widget', 'rollback_widget', 'login', 'logout',
];

export default function AuditTab() {
  const [entries, setEntries]   = useState([]);
  const [filter, setFilter]     = useState('all');
  const [loading, setLoading]   = useState(true);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [error, setError]       = useState('');
  const timerRef                = useRef(null);

  const fetchAudit = useCallback(async () => {
    const result = await listAudit();
    if (result.error) {
      setError(result.error);
    } else {
      setEntries(result.logs || result.entries || result || []);
      setError('');
    }
    setLoading(false);
    setLastRefresh(new Date());
  }, []);

  useEffect(() => {
    fetchAudit();
    timerRef.current = setInterval(fetchAudit, 30_000);
    return () => clearInterval(timerRef.current);
  }, [fetchAudit]);

  const filtered = filter === 'all'
    ? entries
    : entries.filter(e => e.action === filter);

  // Collect unique actions from actual data too
  const seenActions = [...new Set(entries.map(e => e.action).filter(Boolean))];

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-gray-100 font-semibold text-sm">Audit Log</h2>
          <p className="text-gray-500 text-xs mt-0.5">
            {filtered.length} events
            {lastRefresh && (
              <span className="ml-2 text-gray-600">
                &bull; refreshed {lastRefresh.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
              </span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Filter */}
          <select
            value={filter}
            onChange={e => setFilter(e.target.value)}
            className="px-3 py-1.5 bg-gray-900 border border-gray-700 rounded-lg text-gray-200 text-xs focus:border-blue-500 focus:outline-none"
          >
            <option value="all">All Actions</option>
            {[...new Set([...ALL_ACTIONS, ...seenActions])].map(a => (
              <option key={a} value={a}>{a.replace(/_/g, ' ')}</option>
            ))}
          </select>

          {/* Refresh */}
          <button
            onClick={() => { setLoading(true); fetchAudit(); }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs rounded-lg transition-colors"
          >
            <svg className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h5M20 20v-5h-5M4 9a9 9 0 0114.1-4.1M20 15a9 9 0 01-14.1 4.1" />
            </svg>
            Refresh
          </button>
        </div>
      </div>

      {/* Auto-refresh indicator */}
      <div className="flex items-center gap-1.5 mb-3">
        <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
        <span className="text-gray-600 text-xs">Auto-refreshes every 30s</span>
      </div>

      {error && (
        <div className="mb-4 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {/* Table */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800">
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wide">Timestamp</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wide">User</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wide">Action</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wide">Widget / Slug</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wide">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center">
                  <svg className="animate-spin h-5 w-5 text-blue-400 mx-auto" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-500 text-sm">
                  {filter !== 'all' ? `No "${filter}" events found.` : 'No audit log entries.'}
                </td>
              </tr>
            ) : filtered.map((e, i) => (
              <tr key={i} className="hover:bg-gray-800/40 transition-colors">
                <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap font-mono">
                  {formatTs(e.timestamp || e.ts || e.created_at)}
                </td>
                <td className="px-4 py-3">
                  <div className="text-gray-200 text-xs font-medium">{e.user || e.email || '—'}</div>
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-mono font-medium ${ACTION_COLORS[e.action] || 'text-gray-300'}`}>
                    {e.action || '—'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {e.slug || e.widget_slug ? (
                    <span className="px-1.5 py-0.5 bg-gray-800 text-gray-300 rounded text-xs font-mono">
                      {e.slug || e.widget_slug}
                    </span>
                  ) : (
                    <span className="text-gray-600 text-xs">—</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={e.status || 'success'} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
