import { useState, useEffect } from 'react';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import { getMe } from './services/api';

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  async function checkAuth() {
    const token = localStorage.getItem('sam_token');
    if (token) {
      const me = await getMe();
      if (me && me.email) {
        setUser(me);
      }
    }
    setLoading(false);
  }

  function handleLogin(result) {
    setUser({ email: result.email || '', name: result.name, role: result.role, projects: result.projects });
  }

  function handleLogout() {
    setUser(null);
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a] text-gray-400">Loading...</div>;
  }

  if (!user) {
    return <Login onLogin={handleLogin} />;
  }

  return <Dashboard user={user} onLogout={handleLogout} />;
}
