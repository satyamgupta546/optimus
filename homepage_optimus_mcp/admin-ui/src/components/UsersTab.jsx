import { useState } from 'react';
import { addUser, updateUser, removeUser } from '../services/api';

const ROLES = ['user', 'admin', 'super_admin'];

function Badge({ children, variant = 'gray' }) {
  const variants = {
    gray:   'bg-gray-800 text-gray-300',
    green:  'bg-green-500/10 text-green-400 border border-green-500/20',
    red:    'bg-red-500/10 text-red-400 border border-red-500/20',
    yellow: 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20',
    purple: 'bg-purple-500/10 text-purple-400 border border-purple-500/20',
    blue:   'bg-blue-500/10 text-blue-400 border border-blue-500/20',
  };
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${variants[variant]}`}>
      {children}
    </span>
  );
}

function AddUserModal({ projects, onClose, onAdded }) {
  const [form, setForm] = useState({ email: '', name: '', password: '', role: 'user', projects: [] });
  const [msg, setMsg]   = useState('');
  const [saving, setSaving] = useState(false);

  function toggle(pid) {
    setForm(f => ({
      ...f,
      projects: f.projects.includes(pid)
        ? f.projects.filter(x => x !== pid)
        : [...f.projects, pid],
    }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setMsg('');
    const result = await addUser(form);
    setSaving(false);
    if (result.error) { setMsg(result.error); return; }
    onAdded();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-gray-100 font-semibold text-base">Add User</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Email *</label>
              <input type="email" required
                value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                className="w-full px-3 py-2 bg-gray-950 border border-gray-700 rounded-lg text-gray-100 text-sm focus:border-blue-500 focus:outline-none"
                placeholder="user@apnamart.in" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Name *</label>
              <input type="text" required
                value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="w-full px-3 py-2 bg-gray-950 border border-gray-700 rounded-lg text-gray-100 text-sm focus:border-blue-500 focus:outline-none"
                placeholder="Display Name" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Password</label>
              <input type="password"
                value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                className="w-full px-3 py-2 bg-gray-950 border border-gray-700 rounded-lg text-gray-100 text-sm focus:border-blue-500 focus:outline-none"
                placeholder="Optional" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Role</label>
              <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                className="w-full px-3 py-2 bg-gray-950 border border-gray-700 rounded-lg text-gray-100 text-sm focus:border-blue-500 focus:outline-none">
                {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          </div>

          {projects.length > 0 && (
            <div>
              <label className="block text-xs text-gray-400 mb-2">Projects</label>
              <div className="flex flex-wrap gap-2">
                {projects.map(p => (
                  <button key={p.id} type="button" onClick={() => toggle(p.id)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                      form.projects.includes(p.id)
                        ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                        : 'bg-gray-800 text-gray-400 border border-gray-700 hover:border-gray-500'
                    }`}>
                    {p.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {msg && (
            <div className="px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg">
              <p className="text-red-400 text-sm">{msg}</p>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="px-4 py-2 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-40 transition-colors font-medium">
              {saving ? 'Adding...' : 'Add User'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EditUserModal({ user, projects, onClose, onSaved }) {
  const [selectedProjects, setSelectedProjects] = useState(user.projects || []);
  const [status, setStatus]   = useState(user.status || 'active');
  const [password, setPassword] = useState('');
  const [saving, setSaving]   = useState(false);
  const [msg, setMsg]         = useState('');

  function toggle(pid) {
    setSelectedProjects(prev =>
      prev.includes(pid) ? prev.filter(x => x !== pid) : [...prev, pid]
    );
  }

  async function handleSave() {
    setSaving(true);
    setMsg('');
    const updates = { projects: selectedProjects, status };
    if (password) updates.password = password;
    const result = await updateUser(user.email, updates);
    setSaving(false);
    if (result.error) { setMsg(result.error); return; }
    onSaved();
    onClose();
  }

  const isSuperAdmin = user.role === 'super_admin';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="text-gray-100 font-semibold text-base">Edit User</h3>
            <p className="text-gray-500 text-xs mt-0.5">{user.email}</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-4">
          {/* Status */}
          <div>
            <label className="block text-xs text-gray-400 mb-2">Status</label>
            <div className="flex gap-2">
              {['active', 'suspended'].map(s => (
                <button key={s} type="button" onClick={() => setStatus(s)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    status === s
                      ? s === 'active' ? 'bg-green-500/20 text-green-300 border border-green-500/40' : 'bg-red-500/20 text-red-300 border border-red-500/40'
                      : 'bg-gray-800 text-gray-400 border border-gray-700 hover:border-gray-500'
                  }`}>
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Projects */}
          {!isSuperAdmin && projects.length > 0 && (
            <div>
              <label className="block text-xs text-gray-400 mb-2">Projects</label>
              <div className="flex flex-wrap gap-2">
                {projects.map(p => (
                  <button key={p.id} type="button" onClick={() => toggle(p.id)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                      selectedProjects.includes(p.id)
                        ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                        : 'bg-gray-800 text-gray-400 border border-gray-700 hover:border-gray-500'
                    }`}>
                    {p.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {isSuperAdmin && (
            <p className="text-purple-400 text-xs bg-purple-500/10 border border-purple-500/20 px-3 py-2 rounded-lg">
              Super admin has access to all projects.
            </p>
          )}

          {/* Password */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">New Password</label>
            <input type="password" value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full px-3 py-2 bg-gray-950 border border-gray-700 rounded-lg text-gray-100 text-sm focus:border-blue-500 focus:outline-none"
              placeholder="Leave blank to keep current" />
          </div>

          {msg && (
            <div className="px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg">
              <p className="text-red-400 text-sm">{msg}</p>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700 transition-colors">
              Cancel
            </button>
            <button type="button" onClick={handleSave} disabled={saving}
              className="px-4 py-2 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-40 transition-colors font-medium">
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function UsersTab({ users, projects, onRefresh }) {
  const [showAdd, setShowAdd]   = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [removing, setRemoving] = useState(null);

  async function handleRemove(user) {
    if (!window.confirm(`Remove "${user.name}" (${user.email})? This cannot be undone.`)) return;
    setRemoving(user.email);
    await removeUser(user.email);
    setRemoving(null);
    onRefresh();
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-gray-100 font-semibold text-sm">Users</h2>
          <p className="text-gray-500 text-xs mt-0.5">{users.length} total</p>
        </div>
        <button onClick={() => setShowAdd(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white text-xs font-medium rounded-lg transition-colors">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add User
        </button>
      </div>

      {/* Table */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800">
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wide">User</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wide">Role</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wide">Projects</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wide">Status</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wide">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {users.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-500 text-sm">No users found.</td>
              </tr>
            ) : users.map(u => (
              <tr key={u.email} className="hover:bg-gray-800/40 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 text-xs font-bold flex-shrink-0">
                      {(u.name || u.email)[0].toUpperCase()}
                    </div>
                    <div>
                      <div className="text-gray-100 font-medium text-sm">{u.name}</div>
                      <div className="text-gray-500 text-xs">{u.email}</div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <Badge variant={u.role === 'super_admin' ? 'purple' : u.role === 'admin' ? 'blue' : 'gray'}>
                    {u.role}
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  {u.projects && u.projects[0] === '*' ? (
                    <Badge variant="purple">All Projects</Badge>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {(u.projects || []).length === 0
                        ? <span className="text-gray-600 text-xs">None</span>
                        : (u.projects || []).map(pid => {
                            const proj = projects.find(p => p.id === pid);
                            return (
                              <span key={pid} className="px-1.5 py-0.5 bg-gray-800 text-gray-300 rounded text-xs">
                                {proj ? proj.name : pid}
                              </span>
                            );
                          })
                      }
                    </div>
                  )}
                </td>
                <td className="px-4 py-3">
                  <Badge variant={u.status === 'active' ? 'green' : 'red'}>
                    {u.status || 'active'}
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-2">
                    <button onClick={() => setEditUser(u)}
                      className="px-2.5 py-1 text-xs bg-gray-800 text-gray-300 rounded-md hover:bg-gray-700 transition-colors">
                      Edit
                    </button>
                    {u.role !== 'super_admin' && (
                      <button
                        onClick={() => handleRemove(u)}
                        disabled={removing === u.email}
                        className="px-2.5 py-1 text-xs bg-red-500/10 text-red-400 border border-red-500/20 rounded-md hover:bg-red-500/20 disabled:opacity-40 transition-colors">
                        {removing === u.email ? '...' : 'Remove'}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showAdd && (
        <AddUserModal
          projects={projects}
          onClose={() => setShowAdd(false)}
          onAdded={onRefresh}
        />
      )}

      {editUser && (
        <EditUserModal
          user={editUser}
          projects={projects}
          onClose={() => setEditUser(null)}
          onSaved={onRefresh}
        />
      )}
    </div>
  );
}
