import { Image } from 'expo-image';
import { useEffect, useState } from 'react';

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

async function signedUrl(path: string): Promise<string | null> {
  const hit = cache.get(path);
  if (hit && Date.now() - hit.at < REUSE_MS) return hit.url;
  const { data } = await supabase.storage.from('worker-media').createSignedUrl(path, TTL_SECONDS);
  if (!data?.signedUrl) return null;
  cache.set(path, { url: data.signedUrl, at: Date.now() });
  return data.signedUrl;
}

export function ProfilePhoto({ size = 44 }: { size?: number }) {
  const { state } = useMyProfile();
  const profile = state.status === 'ready' ? state.profile : null;
  const path = profile?.avatar_path ?? null;
  // The URL is kept with the path it was made for, so a changed or removed picture never shows the old one.
  const [resolved, setResolved] = useState<{ path: string; url: string | null } | null>(null);

  useEffect(() => {
    if (!path) return;
    let active = true;
    void signedUrl(path).then((next) => {
      if (active) setResolved({ path, url: next });
    });
    return () => {
      active = false;
    };
  }, [path]);

  const url = path && resolved?.path === path ? resolved.url : null;
  if (!url) return <Avatar name={profile?.full_name ?? null} size={size} />;
  return (
    <Image
      source={{ uri: url }}
      style={{ width: size, height: size, borderRadius: size / 2 }}
      contentFit="cover"
      accessibilityLabel={profile?.full_name ?? undefined}
      onError={() => setResolved({ path: path ?? '', url: null })}
    />
  );
}
