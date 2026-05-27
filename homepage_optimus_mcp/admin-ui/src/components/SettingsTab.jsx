import { useState, useEffect, useCallback } from 'react';
import { getHealth, getOAuthClients } from '../services/api';

function HealthIndicator({ status }) {
  const map = {
    ok:      { dot: 'bg-green-400', label: 'Healthy', cls: 'text-green-400' },
    healthy: { dot: 'bg-green-400', label: 'Healthy', cls: 'text-green-400' },
    degraded:{ dot: 'bg-yellow-400 animate-pulse', label: 'Degraded', cls: 'text-yellow-400' },
    down:    { dot: 'bg-red-400 animate-pulse', label: 'Down', cls: 'text-red-400' },
    error:   { dot: 'bg-red-400 animate-pulse', label: 'Error', cls: 'text-red-400' },
    unknown: { dot: 'bg-gray-500', label: 'Unknown', cls: 'text-gray-400' },
  };
  const s = map[status] || map.unknown;
  return (
    <span className="flex items-center gap-1.5">
      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${s.dot}`} />
      <span className={`text-xs font-medium ${s.cls}`}>{s.label}</span>
    </span>
  );
}

function InfoCard({ title, children }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <h3 className="text-gray-400 text-xs font-medium uppercase tracking-wide mb-4">{title}</h3>
      {children}
    </div>
  );
}

function Row({ label, value, mono = false }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-gray-800 last:border-0">
      <span className="text-gray-400 text-xs">{label}</span>
      <span className={`text-gray-200 text-xs ${mono ? 'font-mono' : ''} max-w-xs truncate`}>
        {value ?? '—'}
      </span>
    </div>
  );
}

export default function SettingsTab() {
  const [health, setHealth]   = useState(null);
  const [clients, setClients] = useState([]);
  const [loadingH, setLoadingH] = useState(true);
  const [loadingC, setLoadingC] = useState(true);
  const [errorH, setErrorH]   = useState('');
  const [errorC, setErrorC]   = useState('');

  const fetchHealth = useCallback(async () => {
    setLoadingH(true);
    const result = await getHealth();
    if (result.error) setErrorH(result.error);
    else { setHealth(result); setErrorH(''); }
    setLoadingH(false);
  }, []);

  const fetchClients = useCallback(async () => {
    setLoadingC(true);
    const result = await getOAuthClients();
    if (result.error) setErrorC(result.error);
    else { setClients(result.clients || result || []); setErrorC(''); }
    setLoadingC(false);
  }, []);

  useEffect(() => {
    fetchHealth();
    fetchClients();
  }, [fetchHealth, fetchClients]);

  const serverVersion = health?.version || health?.server_version || null;
  const uptime        = health?.uptime || null;
  const nodeVersion   = health?.node_version || health?.node || null;

  function formatUptime(seconds) {
    if (!seconds) return null;
    const s = Math.floor(seconds);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${h}h ${m}m ${sec}s`;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-gray-100 font-semibold text-sm mb-1">Settings</h2>
        <p className="text-gray-500 text-xs">Server health, OAuth clients, and environment configuration.</p>
      </div>

      {/* Server Health */}
      <InfoCard title="Server Health">
        {loadingH ? (
          <div className="flex items-center justify-center py-4">
            <svg className="animate-spin h-5 w-5 text-blue-400" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
        ) : errorH ? (
          <div className="px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg mb-2">
            <p className="text-red-400 text-xs">{errorH} &mdash; Health endpoint may not be implemented yet.</p>
          </div>
        ) : (
          <>
            <Row label="Status" value={<HealthIndicator status={health?.status || 'ok'} />} />
            {serverVersion && <Row label="Version" value={serverVersion} mono />}
            {nodeVersion   && <Row label="Node.js" value={nodeVersion} mono />}
            {uptime        && <Row label="Uptime"  value={formatUptime(uptime)} mono />}
            {health?.port  && <Row label="Port"    value={health.port} mono />}
            {health?.env   && <Row label="Env"     value={health.env} mono />}
          </>
        )}

        <button onClick={fetchHealth}
          className="mt-4 flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs rounded-lg transition-colors">
          <svg className={`w-3.5 h-3.5 ${loadingH ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h5M20 20v-5h-5M4 9a9 9 0 0114.1-4.1M20 15a9 9 0 01-14.1 4.1" />
          </svg>
          Check Health
        </button>
      </InfoCard>

      {/* Environment URLs */}
      <InfoCard title="Environment URLs">
        <Row label="PROD MCP URL"   value="https://sam-mcp.apnamart.in" mono />
        <Row label="UAT MCP URL"    value="https://sam-mcp-uat.apnamart.in" mono />
        <Row label="Admin Panel"    value={window.location.origin + '/admin'} mono />
        <Row label="MCP Endpoint"   value={window.location.origin + '/mcp'} mono />
        <Row label="Auth Endpoint"  value={window.location.origin + '/api/auth'} mono />
      </InfoCard>

      {/* OAuth Clients */}
      <InfoCard title="OAuth Clients">
        {loadingC ? (
          <div className="flex items-center justify-center py-4">
            <svg className="animate-spin h-5 w-5 text-blue-400" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
        ) : errorC ? (
          <p className="text-yellow-400 text-xs bg-yellow-500/10 border border-yellow-500/20 px-3 py-2 rounded-lg">
            {errorC} &mdash; OAuth clients endpoint may not be implemented yet.
          </p>
        ) : clients.length === 0 ? (
          <p className="text-gray-500 text-sm text-center py-4">No OAuth clients registered.</p>
        ) : (
          <div className="space-y-3">
            {clients.map((c, i) => (
              <div key={c.client_id || i} className="p-3 bg-gray-950 border border-gray-800 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-gray-200 text-xs font-medium">{c.name || c.client_id}</span>
                  <span className={`px-2 py-0.5 rounded text-xs font-medium border ${
                    c.active !== false
                      ? 'bg-green-500/10 text-green-400 border-green-500/20'
                      : 'bg-gray-800 text-gray-500 border-gray-700'
                  }`}>
                    {c.active !== false ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <div className="space-y-1">
                  {c.client_id && (
                    <div className="flex items-center justify-between">
                      <span className="text-gray-500 text-xs">Client ID</span>
                      <span className="text-gray-400 text-xs font-mono">{c.client_id}</span>
                    </div>
                  )}
                  {c.redirect_uri && (
                    <div className="flex items-center justify-between">
                      <span className="text-gray-500 text-xs">Redirect URI</span>
                      <span className="text-gray-400 text-xs font-mono truncate max-w-xs">{c.redirect_uri}</span>
                    </div>
                  )}
                  {c.scopes && (
                    <div className="flex items-center justify-between">
                      <span className="text-gray-500 text-xs">Scopes</span>
                      <span className="text-gray-400 text-xs">{Array.isArray(c.scopes) ? c.scopes.join(', ') : c.scopes}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </InfoCard>

      {/* About */}
      <InfoCard title="About SAM MCP">
        <Row label="Project"       value="SAM MCP Server" />
        <Row label="Organization"  value="Apna Mart" />
        <Row label="Protocol"      value="Model Context Protocol (MCP)" mono />
        <Row label="Auth"          value="OAuth 2.0 + JWT" mono />
        <Row label="Storage"       value="BigQuery + Local JSON" />
      </InfoCard>
    </div>
  );
}
