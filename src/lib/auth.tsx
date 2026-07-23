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
      const storedUser = await API.user();
      setUser(storedUser);

      // Only try to recover the school when we actually HAVE a session.
      //
      // Previously this ran unconditionally: signed out, `stored` was null, so
      // it fell through and fired GET /api/auth/me with no bearer token. `ready`
      // stayed false until that request settled — up to the 30s api.ts timeout
      // on a cold Railway dyno. That is the full-screen purple spinner people
      // see after signing out: the app is waiting on a call that cannot succeed.
      //
      // A token is also required for /me to mean anything, so with no token
      // there is nothing to recover and we can go straight to the login screen.
      const token = await API.token();
      if (token) {
        const stored = await API.school();
        if (stored?._id) {
          setSchool(stored);
        } else {
          try {
            const me = await API.get('/api/auth/me');
            if (me?.school) { setSchool(me.school); await API.setSchool(me.school); }
          } catch { /* stale/expired token — Guard will route to login */ }
        }
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
    // Read the refresh token BEFORE clearing storage.
    //
    // The old call was `API.post('/api/auth/logout', {})` — an empty body. The
    // server only revokes a refresh token when it is named in the request (or
    // allDevices is set), so it revoked the short-lived ACCESS token and left
    // the refresh token valid in the database. Anyone who recovered it could
    // still mint new access tokens; sign-out was not a real sign-out.
    const refreshToken = await API.refreshToken();

    // Clear local state FIRST, then tell the server.
    //
    // The old order awaited the network call before clearing, so on a flaky
    // connection or a cold server the UI sat frozen and still-logged-in for up
    // to 30s. Sign-out must feel instant and must succeed offline: the local
    // session is what gates the UI, and the server call is best-effort cleanup.
    await API.clearSession();
    setUser(null);
    setSchool(null);

    // Fire-and-forget. Deliberately NOT awaited — a hanging request must never
    // hold up a sign-out that has, locally, already happened. Errors are
    // swallowed: the user is signed out on this device either way.
    API.post('/api/auth/logout', refreshToken ? { refreshToken } : {}).catch(() => {});
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
