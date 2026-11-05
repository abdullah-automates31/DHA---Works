// Expo inlines EXPO_PUBLIC_* at bundle time, so each variable must be read by its literal name.
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

/**
 * A release build only talks to the server over https. Plain http is allowed in development (the local Supabase stack
 * on the PC's address), never in a build people install. Pure so it can be unit tested.
 */
export function isAllowedServerUrl(value: string | undefined, development: boolean): boolean {
  if (!value) return false;
  if (value.startsWith('https://')) return true;
  return development && value.startsWith('http://');
}

const development = typeof __DEV__ !== 'undefined' ? __DEV__ : false;
const urlOk = isAllowedServerUrl(url, development);

export const env = {
  supabaseUrl: urlOk ? (url ?? '') : '',
  supabaseAnonKey: anonKey ?? '',
  isConfigured: Boolean(urlOk && anonKey),
};
