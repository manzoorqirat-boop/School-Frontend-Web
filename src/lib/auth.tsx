import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { API, SessionUser } from './api';

type AuthState = {
  ready: boolean;              // finished reading stored session
  user: SessionUser | null;
  school: any | null;
  signIn: (schoolSlug: string | undefined, username: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
  refreshSchool: () => Promise<void>;
};

const Ctx = createContext<AuthState>(null as any);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [school, setSchool] = useState<any | null>(null);

  useEffect(() => {
    (async () => {
      setUser(await API.user());

      // Hydrate the school from storage; if the stored session predates the
      // login response carrying `school`, pull it from /me so the rest of the
      // app has a valid school._id.
      const stored = await API.school();
      if (stored?._id) {
        setSchool(stored);
      } else {
        try {
          const me = await API.get('/api/auth/me');
          if (me?.school) { setSchool(me.school); await API.setSchool(me.school); }
        } catch {}
      }
      setReady(true);
    })();
  }, []);

  const signIn = useCallback(async (schoolSlug: string | undefined, username: string, password: string) => {
    // Same payload the web login sends. superadmin logs in with no slug.
    const body: any = { username, password };
    if (schoolSlug && schoolSlug.trim()) body.schoolSlug = schoolSlug.trim().toLowerCase();

    const res = await API.post('/api/auth/login', body);
    const token = res.accessToken || res.token;
    await API.setSession(token, res.user, res.school, res.refreshToken);
    setUser(res.user);
    setSchool(res.school ?? null);
  }, []);

  const signOut = useCallback(async () => {
    try { await API.post('/api/auth/logout', {}); } catch {}
    await API.clearSession();
    setUser(null);
    setSchool(null);
  }, []);

  // Re-pull the school after master data changes so class/section pickers
  // across the app pick up the new lists without a re-login.
  const refreshSchool = useCallback(async () => {
    try {
      const stored = await API.school();

      // A session created before /login returned a `school` field has no
      // stored school, so `stored._id` is undefined. Previously this returned
      // silently and every `school._id` consumer saw undefined — school-setup
      // then PUT to /api/schools/undefined. Recover it from /me instead.
      let id = stored?._id;
      if (!id) {
        const me = await API.get('/api/auth/me');
        if (me?.school) {
          setSchool(me.school);
          await API.setSchool(me.school);
          id = me.school._id;
        }
      }
      if (!id) return;

      const fresh = await API.get(`/api/schools/${id}`);
      if (fresh) { setSchool(fresh); await API.setSchool(fresh); }
    } catch {}
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const res = await API.get('/api/auth/me');
      if (res?.user) { setUser(res.user); }
    } catch {}
  }, []);

  return (
    <Ctx.Provider value={{ ready, user, school, signIn, signOut, refreshUser, refreshSchool }}>
      {children}
    </Ctx.Provider>
  );
}