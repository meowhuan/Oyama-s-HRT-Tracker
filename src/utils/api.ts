export const getBaseUrl = () => localStorage.getItem('hrt-backend-url') || 'http://localhost:4000';

const getAuthHeader = () => {
  const token = localStorage.getItem('hrt-token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export async function apiRegister(username: string, password: string) {
  const res = await fetch(`${getBaseUrl()}/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
  return res.json();
}

export async function apiLogin(username: string, password: string) {
  const res = await fetch(`${getBaseUrl()}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
  return res.json();
}

export async function apiGetRecords() {
  const res = await fetch(`${getBaseUrl()}/api/records`, { headers: { ...getAuthHeader(), 'Accept': 'application/json' } });
  if (!res.ok) throw new Error('Fetch failed');
  return res.json();
}

export async function apiPostRecord(data: any) {
  const res = await fetch(`${getBaseUrl()}/api/records`, { method: 'POST', headers: { ...getAuthHeader(), 'Content-Type': 'application/json' }, body: JSON.stringify({ data }) });
  return res.json();
}

export async function apiPutRecord(id: number, data: any) {
  const res = await fetch(`${getBaseUrl()}/api/records/${id}`, { method: 'PUT', headers: { ...getAuthHeader(), 'Content-Type': 'application/json' }, body: JSON.stringify({ data }) });
  return res.json();
}

export async function apiDeleteRecord(id: number) {
  const res = await fetch(`${getBaseUrl()}/api/records/${id}`, { method: 'DELETE', headers: { ...getAuthHeader() } });
  return res.json();
}
