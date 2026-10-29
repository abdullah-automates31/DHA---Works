import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';

import { env } from './env';
import { supabase } from './supabase';

type AuthState = {
  /** false until the stored session has been read from the device */
  ready: boolean;
  session: Session | null;
};

const AuthContext = createContext<AuthState>({ ready: false, session: null });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({ ready: !env.isConfigured, session: null });

  useEffect(() => {
    if (!env.isConfigured) return;
    let active = true;

    // The listener only stores the session; no Supabase calls inside it (they can deadlock the auth lock).
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) setState({ ready: true, session });
    });
    void supabase.auth.getSession().then(({ data }) => {
      if (active) setState((prev) => (prev.ready ? prev : { ready: true, session: data.session }));
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo(() => state, [state]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  return useContext(AuthContext);
}
