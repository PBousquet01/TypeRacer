"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { User } from "./types";

interface SessionState {
  user: User | null;
  loading: boolean;
}

interface Session extends SessionState {
  refresh: () => Promise<User | null>;
  signIn: (username: string, password: string) => Promise<User>;
  signUp: (username: string, password: string, displayName: string) => Promise<User>;
  signOut: () => Promise<void>;
}

const signedOut = async () => {
  throw new Error("No session provider.");
};

const SessionContext = createContext<Session>({
  user: null,
  loading: true,
  refresh: async () => null,
  signIn: signedOut,
  signUp: signedOut,
  signOut: signedOut,
});

async function post(path: string, body?: Record<string, string>) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
  return data;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ user: null, loading: true });

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me");
      const data = await res.json();
      setState({ user: data.user ?? null, loading: false });
      return data.user ?? null;
    } catch {
      setState({ user: null, loading: false });
      return null;
    }
  }, []);

  useEffect(() => {
    let active = true;
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((data) => active && setState({ user: data.user ?? null, loading: false }))
      .catch(() => active && setState({ user: null, loading: false }));
    return () => {
      active = false;
    };
  }, []);

  const value = useMemo<Session>(
    () => ({
      ...state,
      refresh,
      signIn: async (username, password) => {
        const { user } = await post("/api/auth/login", { username, password });
        setState({ user, loading: false });
        return user;
      },
      signUp: async (username, password, displayName) => {
        const { user } = await post("/api/auth/signup", { username, password, displayName });
        setState({ user, loading: false });
        return user;
      },
      signOut: async () => {
        await post("/api/auth/logout");
        setState({ user: null, loading: false });
      },
    }),
    [state, refresh],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  return useContext(SessionContext);
}
