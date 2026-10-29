import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { supabase } from '@/lib/supabase';

import { standingFromMyJob, type Standing } from './detail';

export type JobDetail = {
  id: string;
  code: string;
  title: string;
  description: string;
  categoryName: string;
  phase: number;
  lane: string;
  urgency: string;
  postedAt: string | null;
  photos: string[]; // signed URLs, in the order the resident added them
  hasVoiceNote: boolean;
  voiceUrl: string | null;
  others: number | null; // other workers interested (only known for jobs this worker has not engaged with)
  quotes: number | null;
  standing: Standing;
};

export type JobState =
  | { status: 'loading' }
  | { status: 'unavailable' } // not found, expired, taken or not matching this worker: the database hides it
  | { status: 'error' }
  | { status: 'ready'; job: JobDetail };

async function fetchJob(id: string): Promise<JobState> {
  // 1) A job the worker has not engaged with: worker_feed (matching trade and phase, not expired). It carries no
  //    resident name, phone, plot or address, so nothing private can reach this screen.
  const feed = await supabase
    .from('worker_feed')
    .select('id, code, title, description, category_name, phase, lane, urgency, posted_at, voice_note_path, interest_count, quote_count')
    .eq('id', id)
    .maybeSingle();
  if (feed.error) return { status: 'error' };

  let base: Omit<JobDetail, 'photos' | 'voiceUrl'> | null = null;
  let voicePath: string | null = null;

  if (feed.data) {
    voicePath = feed.data.voice_note_path;
    base = {
      id: feed.data.id ?? id,
      code: feed.data.code ?? '',
      title: feed.data.title ?? '',
      description: feed.data.description ?? '',
      categoryName: feed.data.category_name ?? '',
      phase: feed.data.phase ?? 0,
      lane: feed.data.lane ?? '',
      urgency: feed.data.urgency ?? 'asap',
      postedAt: feed.data.posted_at,
      hasVoiceNote: Boolean(voicePath),
      others: feed.data.interest_count ?? 0,
      quotes: feed.data.quote_count ?? 0,
      standing: 'none',
    };
  } else {
    // 2) A job this worker already engaged with (interest or quote): worker_jobs.
    const mine = await supabase
      .from('worker_jobs')
      .select('id, code, title, description, category_name, phase, lane, urgency, posted_at, voice_note_path, status, my_quote_status')
      .eq('id', id)
      .maybeSingle();
    if (mine.error) return { status: 'error' };
    if (!mine.data) return { status: 'unavailable' };
    voicePath = mine.data.voice_note_path;
    base = {
      id: mine.data.id ?? id,
      code: mine.data.code ?? '',
      title: mine.data.title ?? '',
      description: mine.data.description ?? '',
      categoryName: mine.data.category_name ?? '',
      phase: mine.data.phase ?? 0,
      lane: mine.data.lane ?? '',
      urgency: mine.data.urgency ?? 'asap',
      postedAt: mine.data.posted_at,
      hasVoiceNote: Boolean(voicePath),
      others: null,
      quotes: null,
      standing: standingFromMyJob({ status: mine.data.status ?? '', myQuoteStatus: mine.data.my_quote_status }),
    };
  }

  // Photos and the voice note are signed for an hour (private bucket). A problem here never hides the job.
  const photos: string[] = [];
  const rows = await supabase.from('job_photos').select('storage_path, sort').eq('job_id', id).order('sort');
  if (!rows.error && rows.data && rows.data.length > 0) {
    const signed = await supabase.storage.from('job-media').createSignedUrls(
      rows.data.map((r) => r.storage_path),
      3600,
    );
    const byPath = new Map<string, string>();
    for (const item of signed.data ?? []) if (item.path && item.signedUrl) byPath.set(item.path, item.signedUrl);
    for (const r of rows.data) {
      const url = byPath.get(r.storage_path);
      if (url) photos.push(url);
    }
  }
  let voiceUrl: string | null = null;
  if (voicePath) {
    const signed = await supabase.storage.from('job-media').createSignedUrl(voicePath, 3600);
    voiceUrl = signed.data?.signedUrl ?? null;
  }

  return { status: 'ready', job: { ...base, photos, voiceUrl } };
}

export function useJob(id: string): { state: JobState; reload: () => Promise<void> } {
  const [state, setState] = useState<JobState>({ status: 'loading' });

  // Loads when the screen opens and again when it is shown after returning (for example from the quote screen).
  useFocusEffect(
    useCallback(() => {
      let active = true;
      void fetchJob(id).then((next) => {
        if (active) setState((current) => (next.status === 'error' && current.status === 'ready' ? current : next));
      });
      return () => {
        active = false;
      };
    }, [id]),
  );

  const reload = useCallback(async () => {
    setState({ status: 'loading' });
    setState(await fetchJob(id));
  }, [id]);

  return { state, reload };
}

/** Counts the view once per worker (the database ignores repeats). Failures are silent: a view is only a statistic. */
export async function recordJobView(id: string): Promise<void> {
  try {
    await supabase.rpc('record_job_view', { p_job_id: id });
  } catch {
    // nothing to do
  }
}

export async function expressInterest(id: string) {
  return supabase.rpc('express_interest', { p_job_id: id });
}
