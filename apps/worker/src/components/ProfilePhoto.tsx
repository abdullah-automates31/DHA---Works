import { Image } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { stableSource } from '@/lib/image';
import { useMyProfile } from '@/lib/profile';
import { supabase } from '@/lib/supabase';

import { Avatar } from './MyJobParts';

// The worker's own profile picture, shown wherever the app greets or identifies them. Falls back to initials
// until the picture loads, or when there is none. The path comes from profiles.avatar_path (readable after
// approval, unlike verification_documents); the file sits in the private worker-media bucket, so it is
// shown through a short-lived signed URL kept in memory and reused across screens.
const TTL_SECONDS = 3600;
const REUSE_MS = 50 * 60 * 1000; // sign again a little before the URL expires
const cache = new Map<string, { url: string; at: number }>();
const inFlight = new Map<string, Promise<string | null>>();

/** The link already known for this file and still fresh, so a screen can draw the photo on its very first frame. */
function cachedUrl(path: string | null): string | null {
  if (!path) return null;
  const hit = cache.get(path);
  return hit && Date.now() - hit.at < REUSE_MS ? hit.url : null;
}

function signedUrl(path: string): Promise<string | null> {
  const known = cachedUrl(path);
  if (known) return Promise.resolve(known);
  // Several places show the picture at once (Home, headers): they share one request instead of one each.
  const pending = inFlight.get(path);
  if (pending) return pending;
  const request = supabase.storage
    .from('worker-media')
    .createSignedUrl(path, TTL_SECONDS)
    .then(({ data }) => {
      if (!data?.signedUrl) return null;
      cache.set(path, { url: data.signedUrl, at: Date.now() });
      return data.signedUrl;
    })
    .catch(() => null)
    .finally(() => inFlight.delete(path));
  inFlight.set(path, request);
  return request;
}

export function ProfilePhoto({ size = 44 }: { size?: number }) {
  const { state } = useMyProfile();
  const profile = state.status === 'ready' ? state.profile : null;
  const path = profile?.avatar_path ?? null;
  // The URL is kept with the path it was made for, so a changed or removed picture never shows the old one. It starts
  // from the shared cache, so a screen that opens later draws the photo at once instead of flashing the initials.
  const [resolved, setResolved] = useState<{ path: string; url: string | null } | null>(() => (path && cachedUrl(path) ? { path, url: cachedUrl(path) } : null));
  const [failed, setFailed] = useState<string | null>(null);
  const retried = useRef<string | null>(null);

  // A link can expire while the app stays open. Sign once more before giving up and showing the initials.
  const onError = () => {
    if (!path) return;
    if (retried.current === path) {
      setFailed(path);
      return;
    }
    retried.current = path;
    cache.delete(path);
    void signedUrl(path).then((next) => {
      if (next) setResolved({ path, url: next });
      else setFailed(path);
    });
  };

  useEffect(() => {
    // Nothing to do without a picture, or when this file's link is already in hand (from the cache on first render).
    if (!path || (resolved?.path === path && resolved.url)) return;
    let active = true;
    void signedUrl(path).then((next) => {
      if (active) setResolved({ path, url: next });
    });
    return () => {
      active = false;
    };
    // `resolved` is only compared, never needed to re-run this
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  const url = path && failed !== path ? (resolved?.path === path ? resolved.url : cachedUrl(path)) : null;
  const size2 = { width: size, height: size, borderRadius: size / 2 };
  // The initials stay underneath and the photo fades in over them: no swap, so nothing blinks while it loads.
  return (
    <View style={size2}>
      <Avatar name={profile?.full_name ?? null} size={size} />
      {url ? (
        <Image
          source={stableSource(url)}
          style={[StyleSheet.absoluteFill, size2]}
          contentFit="cover"
          cachePolicy="memory-disk"
          priority="high"
          transition={120}
          recyclingKey={path ?? undefined}
          accessibilityLabel={profile?.full_name ?? undefined}
          onLoad={() => {
            retried.current = null;
          }}
          onError={onError}
        />
      ) : null}
    </View>
  );
}
