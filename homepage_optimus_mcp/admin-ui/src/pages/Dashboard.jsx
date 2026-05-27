import { useState, useEffect, useCallback } from 'react';
import { listUsers, listProjects, logout } from '../services/api';
import UsersTab   from '../components/UsersTab';
import AuditTab   from '../components/AuditTab';
import WidgetsTab from '../components/WidgetsTab';
import SettingsTab from '../components/SettingsTab';

const TABS = [
  { id: 'users',    label: 'Users' },
  { id: 'audit',    label: 'Audit Log' },
  { id: 'widgets',  label: 'Widgets' },
  { id: 'settings', label: 'Settings' },
];

function TabButton({ id, label, active, count, onClick }) {
  return (
    <button
      onClick={() => onClick(id)}
      className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg transition-colors ${
        active
          ? 'bg-blue-500 text-white shadow-sm shadow-blue-500/20'
          : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
      }`}
    >
      {label}
      {count != null && (
        <span className={`px-1.5 py-0.5 rounded text-xs ${
          active ? 'bg-white/20 text-white' : 'bg-gray-700 text-gray-400'
        }`}>
          {count}
        </span>
      )}
    </button>
  );
}

export default function Dashboard({ user, onLogout }) {
  const [tab, setTab]         = useState('users');
  const [users, setUsers]     = useState([]);
  const [projects, setProjects] = useState([]);
  const [loadingData, setLoadingData] = useState(true);

  const loadData = useCallback(async () => {
    setLoadingData(true);
    const [u, p] = await Promise.all([listUsers(), listProjects()]);
    setUsers(u.users || []);
    setProjects(p.projects || []);
    setLoadingData(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  function handleLogout() {
    logout();
    onLogout();
  }

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">
      {/* Top Nav */}
      <header className="border-b border-gray-800 bg-gray-900/80 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
          {/* Brand */}
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
              <span className="text-sm font-black text-blue-400 tracking-tighter">S</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-gray-100 font-semibold text-sm">SAM MCP</span>
              <span className="text-gray-600 text-xs">Admin</span>
            </div>
          </div>

          {/* User + Logout */}
          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <div className="text-gray-200 text-xs font-medium">{user.name || user.email}</div>
              <div className="text-gray-500 text-xs">{user.role}</div>
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-6">
        {/* Tabs */}
        <div className="flex gap-1 mb-6 border-b border-gray-800 pb-4 overflow-x-auto">
          {TABS.map(t => (
            <TabButton
              key={t.id}
              id={t.id}
              label={t.label}
              active={tab === t.id}
              count={t.id === 'users' ? users.length : null}
              onClick={setTab}
            />
          ))}
        </div>

        {/* Loading skeleton for initial data */}
        {loadingData && tab === 'users' ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-12 bg-gray-900 border border-gray-800 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : (
          <>
            {tab === 'users'    && <UsersTab users={users} projects={projects} onRefresh={loadData} />}
            {tab === 'audit'    && <AuditTab />}
            {tab === 'widgets'  && <WidgetsTab />}
            {tab === 'settings' && <SettingsTab />}
          </>
        )}
      </main>
    </div>
  );
}
