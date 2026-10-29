import { useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';

export type Trade = { id: number; name: string };
export type WorkData =
  | { status: 'loading' }
  | { status: 'error' }
  | {
      status: 'ready';
      trades: Trade[];
      selected: number[];
      years: number | null;
      fee: number | null;
      voicePath: string | null;
      voiceUrl: string | null;
    };

async function fetchWork(): Promise<WorkData> {
  // RLS: categories are readable by every signed-in user; the worker's own choices and details only by them.
  const [categories, mine, details] = await Promise.all([
    supabase.from('categories').select('id, name').eq('active', true).order('sort'),
    supabase.from('worker_categories').select('category_id'),
    supabase.from('worker_details').select('experience_years, visit_fee, voice_intro_path').maybeSingle(),
  ]);
  if (categories.error || mine.error || details.error) return { status: 'error' };
  const voicePath = details.data?.voice_intro_path ?? null;
  let voiceUrl: string | null = null;
  if (voicePath) {
    const signed = await supabase.storage.from('worker-media').createSignedUrl(voicePath, 3600);
    voiceUrl = signed.data?.signedUrl ?? null;
  }
  const fee = details.data?.visit_fee ?? null;
  return {
    status: 'ready',
    trades: (categories.data ?? []).map((c) => ({ id: c.id, name: c.name })),
    selected: (mine.data ?? []).map((m) => m.category_id),
    years: details.data?.experience_years ?? null,
    // The database default is 0 ("no visit fee"); show a field as empty rather than a fee the worker never entered.
    fee: fee === 0 ? null : fee,
    voicePath,
    voiceUrl,
  };
}

export function useWork(): WorkData {
  const [data, setData] = useState<WorkData>({ status: 'loading' });
  useEffect(() => {
    let active = true;
    void fetchWork().then((next) => {
      if (active) setData(next);
    });
    return () => {
      active = false;
    };
  }, []);
  return data;
}
