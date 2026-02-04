import React, { createContext, useContext, useEffect, useState } from 'react';

type AuthContextValue = {
  token: string | null;
  user?: { id?: number; username?: string; email?: string; is_admin?: boolean; verified?: boolean } | null;
  login: (username: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  register: (username: string, password: string, email?: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => void;
  baseUrl: string;
  setBaseUrl: (url: string) => void;
  mode: 'embedded' | 'remote';
  setMode: (m: 'embedded' | 'remote') => void;
  dbType: 'sqlite' | 'postgres';
  setDbType: (d: 'sqlite' | 'postgres') => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const DEFAULT_BASE = (window as any).__HRT_BACKEND_URL__ || localStorage.getItem('hrt-backend-url') || 'http://localhost:4000';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('hrt-token'));
  const [baseUrl, setBaseUrlState] = useState<string>(() => DEFAULT_BASE);
  const [mode, setModeState] = useState<'embedded' | 'remote'>(() => (localStorage.getItem('hrt-backend-mode') as 'embedded' | 'remote') || 'remote');
  const [dbType, setDbTypeState] = useState<'sqlite' | 'postgres'>(() => (localStorage.getItem('hrt-db-type') as 'sqlite' | 'postgres') || 'sqlite');
  const [user, setUser] = useState<{ id?: number; username?: string } | null>(() => {
    const u = localStorage.getItem('hrt-username');
    return u ? { username: u } : null;
  });

  useEffect(() => { if (token) localStorage.setItem('hrt-token', token); else localStorage.removeItem('hrt-token'); }, [token]);
  useEffect(() => { localStorage.setItem('hrt-backend-url', baseUrl); }, [baseUrl]);
  useEffect(() => { localStorage.setItem('hrt-backend-mode', mode); }, [mode]);
  useEffect(() => { localStorage.setItem('hrt-db-type', dbType); }, [dbType]);
  useEffect(() => { if (user && user.username) localStorage.setItem('hrt-username', user.username); else localStorage.removeItem('hrt-username'); }, [user]);

  const login = async (username: string, password: string) => {
    try {
      const resp = await fetch(`${baseUrl}/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data: any = await resp.json();
      if (resp.ok && data.token) {
        setToken(data.token);
        // fetch profile
        try {
          const meRes = await fetch(`${baseUrl}/auth/me`, { headers: { Authorization: `Bearer ${data.token}` } });
          const me: any = await meRes.json();
          setUser({ id: me.id, username: me.username, email: me.email, is_admin: !!me.is_admin, verified: !!me.verified, is_root: !!me.is_root });
        } catch (e) { setUser({ username }); }
        return { ok: true };
      }
      return { ok: false, error: data.error || '登录失败' };
    } catch (err) {
      console.error(err);
      return { ok: false, error: '网络错误' };
    }
  };

  const register = async (username: string, password: string, email?: string) => {
    try {
      const body: any = { username, password };
      if (email) body.email = email;
      const resp = await fetch(`${baseUrl}/auth/register`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data: any = await resp.json();
      if (resp.ok && data.token) {
        setToken(data.token);
        try {
          const meRes = await fetch(`${baseUrl}/auth/me`, { headers: { Authorization: `Bearer ${data.token}` } });
          const me: any = await meRes.json();
          setUser({ id: me.id, username: me.username, email: me.email, is_admin: !!me.is_admin, verified: !!me.verified, is_root: !!me.is_root });
        } catch (e) { setUser({ username }); }
        return { ok: true };
      }
      return { ok: false, error: data.error || '注册失败' };
    } catch (err) {
      console.error(err);
      return { ok: false, error: '网络错误' };
    }
  };

  const logout = () => {
    setToken(null);
    setUser(null);
  };

  // initialize from token if present
  useEffect(() => {
    (async () => {
      const tok = localStorage.getItem('hrt-token');
      if (tok) {
        try {
          const meRes = await fetch(`${baseUrl}/auth/me`, { headers: { Authorization: `Bearer ${tok}` } });
          if (meRes.ok) {
            const me: any = await meRes.json();
            setUser({ id: me.id, username: me.username, email: me.email, is_admin: !!me.is_admin, verified: !!me.verified, is_root: !!me.is_root });
            setToken(tok);
          } else {
            setToken(null);
          }
        } catch (e) { setToken(null); }
      }
    })();
  }, []);

  const setBaseUrl = (url: string) => setBaseUrlState(url);
  const setMode = (m: 'embedded' | 'remote') => setModeState(m);
  const setDbType = (d: 'sqlite' | 'postgres') => setDbTypeState(d);

  return (
    <AuthContext.Provider value={{ token, user, login, register, logout, baseUrl, setBaseUrl, mode, setMode, dbType, setDbType }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};

export default AuthContext;
