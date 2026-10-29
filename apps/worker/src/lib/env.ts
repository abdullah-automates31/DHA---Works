// Expo inlines EXPO_PUBLIC_* at bundle time, so each variable must be read by its literal name.
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const env = {
  supabaseUrl: url ?? '',
  supabaseAnonKey: anonKey ?? '',
  isConfigured: Boolean(url && anonKey),
};
