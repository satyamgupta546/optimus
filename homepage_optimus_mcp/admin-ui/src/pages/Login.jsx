import { useState } from 'react';
import { login } from '../services/api';

export default function Login({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const result = await login(email, password);
    setLoading(false);
    if (result.token) {
      onLogin(result);
    } else {
      setError(result.error || 'Login failed');
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a]">
      <div className="w-full max-w-sm p-8 bg-[#1a1a2e] rounded-2xl shadow-xl">
        <h1 className="text-2xl font-bold text-[#4fc3f7] mb-1">SAM MCP</h1>
        <p className="text-gray-400 text-sm mb-6">Admin Login</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Email</label>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)}
              className="w-full px-3 py-2 bg-[#0a0a0a] border border-gray-700 rounded-lg text-white focus:border-[#4fc3f7] focus:outline-none"
              placeholder="email@apnamart.in" required
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Password</label>
            <input
              type="password" value={password} onChange={e => setPassword(e.target.value)}
              className="w-full px-3 py-2 bg-[#0a0a0a] border border-gray-700 rounded-lg text-white focus:border-[#4fc3f7] focus:outline-none"
              required
            />
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button
            type="submit" disabled={loading}
            className="w-full py-2 bg-[#4fc3f7] text-black font-semibold rounded-lg hover:bg-[#39b0e6] disabled:opacity-50"
          >
            {loading ? 'Logging in...' : 'Login'}
          </button>
        </form>
      </div>
    </div>
  );
}
