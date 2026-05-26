const API = '/api';

function getToken() {
  return localStorage.getItem('sam_token') || '';
}

function headers(json = true) {
  const h = { 'Authorization': `Bearer ${getToken()}` };
  if (json) h['Content-Type'] = 'application/json';
  return h;
}

export async function login(email, password) {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (data.token) localStorage.setItem('sam_token', data.token);
  return data;
}

export async function getMe() {
  const res = await fetch(`${API}/auth/me`, { headers: headers(false) });
  if (!res.ok) return null;
  return res.json();
}

export async function listUsers() {
  const res = await fetch(`${API}/admin/users`, { headers: headers(false) });
  return res.json();
}

export async function addUser(email, name, password, projects) {
  const res = await fetch(`${API}/admin/users`, {
    method: 'POST', headers: headers(),
    body: JSON.stringify({ email, name, password, projects }),
  });
  return res.json();
}

export async function updateUser(email, updates) {
  const res = await fetch(`${API}/admin/users`, {
    method: 'PUT', headers: headers(),
    body: JSON.stringify({ email, ...updates }),
  });
  return res.json();
}

export async function removeUser(email) {
  const res = await fetch(`${API}/admin/users`, {
    method: 'DELETE', headers: headers(),
    body: JSON.stringify({ email }),
  });
  return res.json();
}

export async function listProjects() {
  const res = await fetch(`${API}/admin/projects`, { headers: headers(false) });
  return res.json();
}

export function logout() {
  localStorage.removeItem('sam_token');
}
