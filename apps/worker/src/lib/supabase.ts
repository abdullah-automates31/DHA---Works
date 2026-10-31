import type { Database } from '@dha/supabase';
import { createClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';

import { env } from './env';
import { secureStorage } from './secureStorage';

// Only the public URL and the anon/publishable key are ever used here. RLS and the RPCs decide access;
// never put the service-role key in this app.
export const supabase = createClient<Database>(
  env.supabaseUrl || 'http://localhost.invalid',
  env.supabaseAnonKey || 'missing-key',
  {
    auth: {
      storage: secureStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false, // phone OTP codes, no deep-link sessions
    },
  },
);

// Refresh tokens only while the app is in the foreground.
AppState.addEventListener('change', (state) => {
  if (state === 'active') void supabase.auth.startAutoRefresh();
  else void supabase.auth.stopAutoRefresh();
});
