import { useState, useEffect } from 'react';
import { listUsers, listProjects, addUser, updateUser, removeUser, logout } from '../services/api';

export default function Dashboard({ user, onLogout }) {
  const [tab, setTab] = useState('users');
  const [users, setUsers] = useState([]);
  const [projects, setProjects] = useState([]);
  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    const u = await listUsers();
    setUsers(u.users || []);
    const p = await listProjects();
    setProjects(p.projects || []);
  }

  function handleLogout() {
    logout();
    onLogout();
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-[#4fc3f7]">SAM MCP Admin</h1>
          <p className="text-gray-400 text-sm">{user.name} ({user.role})</p>
        </div>
        <button onClick={handleLogout} className="px-4 py-2 text-sm bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700">
          Logout
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        <button onClick={() => setTab('users')}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${tab === 'users' ? 'bg-[#4fc3f7] text-black' : 'bg-gray-800 text-gray-300'}`}>
          Users ({users.length})
        </button>
        <button onClick={() => setTab('projects')}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${tab === 'projects' ? 'bg-[#4fc3f7] text-black' : 'bg-gray-800 text-gray-300'}`}>
          Projects ({projects.length})
        </button>
      </div>

      {/* Content */}
      {tab === 'users' && <UsersTab users={users} projects={projects} onRefresh={loadData} showAdd={showAdd} setShowAdd={setShowAdd} />}
      {tab === 'projects' && <ProjectsTab projects={projects} />}
    </div>
  );
}

function UsersTab({ users, projects, onRefresh, showAdd, setShowAdd }) {
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newProjects, setNewProjects] = useState([]);
  const [msg, setMsg] = useState('');

  async function handleAdd(e) {
    e.preventDefault();
    const result = await addUser(newEmail, newName, newPassword, newProjects);
    setMsg(result.message || result.error);
    if (result.message) {
      setNewEmail(''); setNewName(''); setNewPassword(''); setNewProjects([]);
      setShowAdd(false);
      onRefresh();
    }
  }

  async function handleSetPassword(email) {
    const pw = prompt(`Set password for ${email}:`);
    if (!pw) return;
    const result = await updateUser(email, { password: pw });
    alert(result.message || result.error);
    onRefresh();
  }

  async function handleToggleProject(email, currentProjects, projectId) {
    const updated = currentProjects.includes(projectId)
      ? currentProjects.filter(p => p !== projectId)
      : [...currentProjects, projectId];
    await updateUser(email, { projects: updated });
    onRefresh();
  }

  async function handleRemove(email) {
    if (!confirm(`Remove ${email}?`)) return;
    const result = await removeUser(email);
    alert(result.message || result.error);
    onRefresh();
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold text-[#81c784]">Users</h2>
        <button onClick={() => setShowAdd(!showAdd)}
          className="px-4 py-2 text-sm bg-[#1b5e20] text-white rounded-lg hover:bg-[#2e7d32]">
          + Add User
        </button>
      </div>

      {showAdd && (
        <form onSubmit={handleAdd} className="bg-[#1a1a2e] p-4 rounded-xl mb-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <input value={newEmail} onChange={e => setNewEmail(e.target.value)}
              placeholder="Email" type="email" required
              className="px-3 py-2 bg-[#0a0a0a] border border-gray-700 rounded-lg text-white text-sm" />
            <input value={newName} onChange={e => setNewName(e.target.value)}
              placeholder="Name" required
              className="px-3 py-2 bg-[#0a0a0a] border border-gray-700 rounded-lg text-white text-sm" />
            <input value={newPassword} onChange={e => setNewPassword(e.target.value)}
              placeholder="Password (optional)" type="password"
              className="px-3 py-2 bg-[#0a0a0a] border border-gray-700 rounded-lg text-white text-sm" />
            <div className="flex gap-2 items-center flex-wrap">
              {projects.map(p => (
                <label key={p.id} className="flex items-center gap-1 text-sm text-gray-300">
                  <input type="checkbox" checked={newProjects.includes(p.id)}
                    onChange={e => setNewProjects(e.target.checked ? [...newProjects, p.id] : newProjects.filter(x => x !== p.id))} />
                  {p.name}
                </label>
              ))}
            </div>
          </div>
          {msg && <p className="text-sm text-yellow-400">{msg}</p>}
          <button type="submit" className="px-4 py-2 text-sm bg-[#4fc3f7] text-black rounded-lg font-medium">Add</button>
        </form>
      )}

      <div className="bg-[#1a1a2e] rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[#0a0a1a] text-gray-400">
              <th className="px-4 py-3 text-left">User</th>
              <th className="px-4 py-3 text-left">Role</th>
              <th className="px-4 py-3 text-left">Projects</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.email} className="border-t border-gray-800 hover:bg-[#0a0a1a]">
                <td className="px-4 py-3">
                  <div className="text-white font-medium">{u.name}</div>
                  <div className="text-gray-500 text-xs">{u.email}</div>
                </td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-1 rounded text-xs font-medium ${u.role === 'super_admin' ? 'bg-purple-900 text-purple-200' : 'bg-gray-800 text-gray-300'}`}>
                    {u.role}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {u.projects[0] === '*' ? (
                    <span className="text-purple-300 text-xs">All projects</span>
                  ) : (
                    <div className="flex gap-1 flex-wrap">
                      {projects.map(p => (
                        <button key={p.id} onClick={() => u.role !== 'super_admin' && handleToggleProject(u.email, u.projects, p.id)}
                          className={`px-2 py-0.5 rounded text-xs ${u.projects.includes(p.id) ? 'bg-[#1b5e20] text-green-200' : 'bg-gray-800 text-gray-500'} ${u.role !== 'super_admin' ? 'cursor-pointer hover:opacity-80' : ''}`}>
                          {p.name}
                        </button>
                      ))}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-1 rounded text-xs ${u.status === 'active' ? 'bg-green-900 text-green-200' : 'bg-yellow-900 text-yellow-200'}`}>
                    {u.status}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {u.role !== 'super_admin' && (
                    <div className="flex gap-2">
                      <button onClick={() => handleSetPassword(u.email)}
                        className="px-2 py-1 text-xs bg-blue-900 text-blue-200 rounded hover:bg-blue-800">
                        Set Password
                      </button>
                      <button onClick={() => handleRemove(u.email)}
                        className="px-2 py-1 text-xs bg-red-900 text-red-200 rounded hover:bg-red-800">
                        Remove
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ProjectsTab({ projects }) {
  return (
    <div>
      <h2 className="text-lg font-semibold text-[#81c784] mb-4">Projects</h2>
      <div className="grid gap-4">
        {projects.map(p => (
          <div key={p.id} className="bg-[#1a1a2e] p-4 rounded-xl">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-white font-medium">{p.name}</h3>
              <span className={`px-2 py-1 rounded text-xs ${p.status === 'active' ? 'bg-green-900 text-green-200' : 'bg-gray-800 text-gray-400'}`}>
                {p.status}
              </span>
            </div>
            <p className="text-gray-400 text-sm mb-3">{p.description}</p>
            {p.tools && p.tools.length > 0 && (
              <div className="flex gap-2 flex-wrap">
                {p.tools.map(t => (
                  <span key={t} className="px-2 py-1 bg-[#0a0a0a] text-gray-300 rounded text-xs font-mono">{t}</span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
