// Private storage images are shown through signed URLs, and every signing gives a new "?token=...". expo-image caches
// by the full URL, so without a stable key the same photo was downloaded again on every refresh and screen change.
// The file path inside the URL never changes for a given file (uploads use upsert: false, so a path is never
// overwritten), so the URL without its query string is a safe cache key.

export function stableCacheKey(uri: string): string {
  const cut = uri.indexOf('?');
  return cut === -1 ? uri : uri.slice(0, cut);
}

export function stableSource(uri: string): { uri: string; cacheKey: string } {
  return { uri, cacheKey: stableCacheKey(uri) };
}
