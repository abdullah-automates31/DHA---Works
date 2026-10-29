import { supabase } from '@/lib/supabase';

import type { StorageClient } from './upload';

// The real storage + RPC calls behind uploadDocument. Row-level security and the RPC decide what is allowed.
export const storageClient: StorageClient = {
  upload: (bucket, path, bytes, contentType) =>
    supabase.storage.from(bucket).upload(path, bytes, { contentType, upsert: false }),
  record: (type, path) => supabase.rpc('add_verification_document', { p_type: type, p_path: path }),
};
