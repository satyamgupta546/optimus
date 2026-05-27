import { useState, useEffect } from 'react';
import Login     from './pages/Login';
import Dashboard from './pages/Dashboard';
import { getMe } from './services/api';

export default function App() {
  const [user, setUser]       = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('sam_token');
    if (!token) { setLoading(false); return; }
    getMe()
      .then(me => { if (me && me.email) setUser(me); })
      .finally(() => setLoading(false));
  }, []);

  function handleLogin(result) {
    setUser({
      email:    result.email || '',
      name:     result.name,
      role:     result.role,
      projects: result.projects,
    });
  }

  function handleLogout() {
    setUser(null);
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950">
        <svg className="animate-spin h-6 w-6 text-blue-400" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    );
  }

  if (!user) {
    return <Login onLogin={handleLogin} />;
  }

  return <Dashboard user={user} onLogout={handleLogout} />;
}
