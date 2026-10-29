// Uploads one verification document: file to storage first, then the database row that points to it.
// Injectable client so the order and the failure handling can be unit tested.
import { bucketFor, buildPath, checkFile, type DocType } from './files.ts';

export type UploadErrorKey =
  | 'documents.errors.type'
  | 'documents.errors.size'
  | 'documents.errors.empty'
  | 'documents.errors.locked'
  | 'documents.errors.network'
  | 'documents.errors.generic';

export type UploadResult = { ok: true; path: string } | { ok: false; key: UploadErrorKey };

type Err = { name?: string; message?: string; statusCode?: string | number } | null;
export type StorageClient = {
  upload(bucket: string, path: string, bytes: ArrayBuffer, contentType: string): PromiseLike<{ error: Err }>;
  record(type: DocType, path: string): PromiseLike<{ error: Err }>;
};

export type UploadInput = {
  userId: string;
  type: DocType;
  mime: string | null | undefined;
  bytes: ArrayBuffer;
  now?: number;
  random?: string;
};

function errorKey(error: Err): UploadErrorKey {
  const text = `${error?.name ?? ''} ${error?.message ?? ''}`.toLowerCase();
  if (text.includes('row-level security') || text.includes('can only be changed') || text.includes('violates')) {
    return 'documents.errors.locked';
  }
  if (text.includes('exceeded') || text.includes('too large') || String(error?.statusCode) === '413') {
    return 'documents.errors.size';
  }
  if (text.includes('network') || text.includes('fetch') || error?.name === 'TypeError') {
    return 'documents.errors.network';
  }
  return 'documents.errors.generic';
}

export async function uploadDocument(client: StorageClient, input: UploadInput): Promise<UploadResult> {
  const check = checkFile(input.type, input.mime, input.bytes.byteLength);
  if (!check.ok) {
    return { ok: false, key: check.reason === 'type' ? 'documents.errors.type' : check.reason === 'size' ? 'documents.errors.size' : 'documents.errors.empty' };
  }
  const path = buildPath(
    input.userId,
    input.type,
    check.extension,
    input.now ?? Date.now(),
    input.random ?? Math.random().toString(16).slice(2, 10),
  );
  try {
    const stored = await client.upload(bucketFor(input.type), path, input.bytes, (input.mime ?? '').toLowerCase());
    if (stored.error) return { ok: false, key: errorKey(stored.error) };
    // The file is in storage; now point the profile at it. If this fails the file stays unreferenced
    // (the owner cannot delete it yet: see the storage proposal) and the worker can simply try again.
    const recorded = await client.record(input.type, path);
    if (recorded.error) return { ok: false, key: errorKey(recorded.error) };
    return { ok: true, path };
  } catch (thrown) {
    return { ok: false, key: thrown instanceof Error && thrown.name === 'TypeError' ? 'documents.errors.network' : 'documents.errors.generic' };
  }
}
