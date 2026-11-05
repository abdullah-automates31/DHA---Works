import { supabase } from '@/lib/supabase';

// Private-bucket files are shown through signed URLs. One call signs many paths, so a whole page of photos costs a
// single request. A path that cannot be signed is simply missing from the map: a photo problem never hides a job.
export const URL_TTL_SECONDS = 3600;

export async function signedUrlMap(bucket: string, paths: readonly string[], ttl: number = URL_TTL_SECONDS): Promise<Map<string, string>> {
  const unique = [...new Set(paths)];
  const byPath = new Map<string, string>();
  if (unique.length === 0) return byPath;
  const signed = await supabase.storage.from(bucket).createSignedUrls(unique, ttl);
  for (const item of signed.data ?? []) if (item.path && item.signedUrl) byPath.set(item.path, item.signedUrl);
  return byPath;
}
