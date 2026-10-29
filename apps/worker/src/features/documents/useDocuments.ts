import { useCallback, useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';

import { summarize, type DocumentsState } from './files';

type Loaded = { status: 'ready'; docs: DocumentsState; photoUrl: string | null };
export type DocumentsData = { status: 'loading' } | { status: 'error' } | Loaded;

async function fetchDocuments(): Promise<DocumentsData> {
  // RLS: the owner reads their own rows while the application is editable, nobody else's.
  const [docs, refs] = await Promise.all([
    supabase.from('verification_documents').select('doc_type, storage_path'),
    supabase.from('worker_references').select('id'),
  ]);
  if (docs.error || refs.error) return { status: 'error' };
  const rows = docs.data ?? [];
  const photoPath = rows.find((r) => r.doc_type === 'profile_photo')?.storage_path;
  let photoUrl: string | null = null;
  if (photoPath) {
    // The profile photo lives in worker-media, which the owner can read; identity files are never read back.
    const signed = await supabase.storage.from('worker-media').createSignedUrl(photoPath, 3600);
    photoUrl = signed.data?.signedUrl ?? null;
  }
  return {
    status: 'ready',
    docs: summarize(rows.map((r) => r.doc_type), (refs.data ?? []).length),
    photoUrl,
  };
}

export function useDocuments(): { data: DocumentsData; refresh: () => Promise<void> } {
  const [data, setData] = useState<DocumentsData>({ status: 'loading' });

  useEffect(() => {
    let active = true;
    void fetchDocuments().then((next) => {
      if (active) setData(next);
    });
    return () => {
      active = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    setData(await fetchDocuments());
  }, []);

  return { data, refresh };
}
