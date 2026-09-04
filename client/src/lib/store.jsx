import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { api } from './api.js';

/* --------------------------------------------------------------------- theme */

const ThemeCtx = createContext(null);
export const useTheme = () => useContext(ThemeCtx);

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => localStorage.getItem('gradient-theme') || 'dark');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('gradient-theme', theme);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#080A0F' : '#F5F6FA');
  }, [theme]);

  const value = useMemo(() => ({ theme, toggle: () => setTheme((t) => (t === 'dark' ? 'light' : 'dark')) }), [theme]);
  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

/* ---------------------------------------------------------------------- auth */

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [booting, setBooting] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      const res = await api.me();
      setUser(res.user);
      setProfile(res.profile);
      return res.user;
    } catch {
      setUser(null);
      setProfile(null);
      return null;
    }
  }, []);

  useEffect(() => { refreshUser().finally(() => setBooting(false)); }, [refreshUser]);

  const value = {
    user, profile, booting, setProfile, refreshUser,
    login: async (creds) => { await api.login(creds); return refreshUser(); },
    signup: async (creds) => { await api.signup(creds); return refreshUser(); },
    logout: async () => { await api.logout(); setUser(null); setProfile(null); },
  };
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

/* ------------------------------------------------------- academic data cache */

const DataCtx = createContext(null);
export const useData = () => useContext(DataCtx);

export function DataProvider({ children }) {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    if (!user) { setData(null); setLoading(false); return; }
    try {
      setError(null);
      const res = await api.analysis();
      setData(res);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { setLoading(true); refresh(); }, [refresh]);

  return <DataCtx.Provider value={{ data, loading, error, refresh }}>{children}</DataCtx.Provider>;
}
