const resolveBaseUrl = () => {
  if (typeof window === 'undefined') return 'http://localhost:4000';
  const injected = (window as any).__HRT_BACKEND_URL__;
  if (injected) return injected;
  const stored = localStorage.getItem('hrt-backend-url');
  if (stored) return stored;
  const { protocol, host, origin } = window.location || {} as any;
  if ((protocol === 'http:' || protocol === 'https:') && host) return origin;
  return 'http://localhost:4000';
};

export const getBaseUrl = () => resolveBaseUrl();

const getAuthHeader = () => {
  const token = localStorage.getItem('hrt-token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export async function apiRegister(username: string, password: string) {
  const res = await fetch(`${getBaseUrl()}/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
  return res.json();
}

export async function apiLogin(username: string, password: string, adminKey?: string, otp?: string) {
  const payload: any = { username, password };
  if (adminKey) payload.adminKey = adminKey;
  if (otp) payload.otp = otp;
  const res = await fetch(`${getBaseUrl()}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
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

export type SetupStatus = {
  configured: boolean;
  dbType?: 'sqlite' | 'postgres' | 'mysql';
  dbPath?: string;
  dbHost?: string;
  dbPort?: number | string;
  dbUser?: string;
  dbName?: string;
  updatedAt?: string | null;
  dbPasswordSet?: boolean;
  auth?: {
    configured?: boolean;
    enableVerification?: boolean;
    enable2FA?: boolean;
    noVerification?: boolean;
  };
};

export async function apiGetSetupStatus(baseUrlOverride?: string): Promise<SetupStatus> {
  const base = baseUrlOverride || getBaseUrl();
  const res = await fetch(`${base}/setup/status`, { headers: { 'Accept': 'application/json' } });
  if (!res.ok) throw new Error('Fetch setup status failed');
  return res.json() as Promise<SetupStatus>;
}

export async function apiCompleteSetup(payload: { dbType: 'sqlite' | 'postgres' | 'mysql'; dbPath?: string; dbHost?: string; dbPort?: number; dbUser?: string; dbPassword?: string; dbName?: string; auth?: { enableVerification?: boolean; enable2FA?: boolean; noVerification?: boolean } }, baseUrlOverride?: string) {
  const base = baseUrlOverride || getBaseUrl();
  const res = await fetch(`${base}/setup/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = (await res.json().catch(() => ({}))) as any;
  if (!res.ok) {
    throw new Error(data?.error || 'Setup failed');
  }
  return data;
}

export async function apiTestSetupConnection(payload: { dbType: 'sqlite' | 'postgres' | 'mysql'; dbPath?: string; dbHost?: string; dbPort?: number; dbUser?: string; dbPassword?: string; dbName?: string }, baseUrlOverride?: string) {
  const base = baseUrlOverride || getBaseUrl();
  const res = await fetch(`${base}/setup/test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = (await res.json().catch(() => ({}))) as any;
  if (!res.ok) {
    throw new Error(data?.error || 'Test failed');
  }
  return data;
}
