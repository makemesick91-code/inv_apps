'use client';

import { SESSION_EXPIRED_EVENT, api } from '@/lib/api';
import { User } from '@/types';
import { useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';

interface AuthContextValue {
  user: User | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const SESSION_EXPIRED_QUERY = '?reason=session_expired';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const stored = localStorage.getItem('token');
    if (stored) {
      setToken(stored);
      api
        .get<User>('/me')
        .then(setUser)
        .catch(() => {
          localStorage.removeItem('token');
        })
        .finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, []);

  // Listen for global 401 events from api.ts (token expired/revoked).
  // The api.ts has already cleared localStorage — we just clear UI state
  // and redirect to login with a flag so the page can show a notice.
  useEffect(() => {
    function handler() {
      setToken(null);
      setUser(null);
      if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
        router.replace(`/login${SESSION_EXPIRED_QUERY}`);
      }
    }
    window.addEventListener(SESSION_EXPIRED_EVENT, handler);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, handler);
  }, [router]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.post<{ user: User; token: string; token_expires_at: string | null }>(
      '/login',
      { email, password }
    );
    localStorage.setItem('token', res.token);
    if (res.token_expires_at) {
      localStorage.setItem('token_expires_at', res.token_expires_at);
    }
    setToken(res.token);
    setUser(res.user);
  }, []);

  const logout = useCallback(async () => {
    await api.post('/logout', {}).catch(() => null);
    localStorage.removeItem('token');
    localStorage.removeItem('token_expires_at');
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
