// Pure rules for the W03 document uploads (unit tested with node --test). No file contents or names are
// ever put into errors or logs; paths contain only the user id, the document type and a random suffix.

export type DocType = 'cnic_front' | 'cnic_back' | 'police_cert' | 'profile_photo';

export const MAX_FILE_BYTES = 5 * 1024 * 1024; // the bucket limit (supabase/migrations 0012)
export const MAX_IMAGE_EDGE = 1600; // pixels, longest side
export const IMAGE_QUALITY = 0.7;

type Bucket = 'identity' | 'worker-media';

/** CNIC and certificate go to the staff-only identity bucket; the profile photo to worker-media. */
export function bucketFor(type: DocType): Bucket {
  return type === 'profile_photo' ? 'worker-media' : 'identity';
}

/** CNIC and the photo must be images; only the police certificate may also be a PDF (design: "photo or PDF"). */
export function allowedMimes(type: DocType): string[] {
  const images = ['image/jpeg', 'image/png', 'image/webp'];
  return type === 'police_cert' ? [...images, 'application/pdf'] : images;
}

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

export type FileCheck = { ok: true; extension: string } | { ok: false; reason: 'type' | 'size' | 'empty' };

export function checkFile(type: DocType, mime: string | null | undefined, bytes: number): FileCheck {
  const clean = (mime ?? '').toLowerCase();
  if (!allowedMimes(type).includes(clean)) return { ok: false, reason: 'type' };
  if (bytes <= 0) return { ok: false, reason: 'empty' };
  if (bytes > MAX_FILE_BYTES) return { ok: false, reason: 'size' };
  return { ok: true, extension: EXTENSIONS[clean] ?? 'bin' };
}

/**
 * "<user id>/<type>-<time>-<random>.<ext>". The first folder must be the user id (storage policy and
 * add_verification_document both check it). A new name for every upload, because the owner may not overwrite.
 */
export function buildPath(userId: string, type: DocType, extension: string, now: number, random: string): string {
  return `${userId}/${type}-${now}-${random}.${extension}`;
}

/** Size to scale an image to so its longest side is at most `max`; null when it already fits. */
export function fitWithin(width: number, height: number, max: number = MAX_IMAGE_EDGE): { width: number; height: number } | null {
  const longest = Math.max(width, height);
  if (!(longest > max)) return null;
  const scale = max / longest;
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

export type DocumentsState = {
  cnicFront: boolean;
  cnicBack: boolean;
  policeCert: boolean;
  profilePhoto: boolean;
  references: number;
};

export function summarize(types: readonly string[], referenceCount: number): DocumentsState {
  const has = (t: DocType) => types.includes(t);
  return {
    cnicFront: has('cnic_front'),
    cnicBack: has('cnic_back'),
    policeCert: has('police_cert'),
    profilePhoto: has('profile_photo'),
    references: referenceCount,
  };
}

export type MissingItem = 'cnic_front' | 'cnic_back' | 'profile_photo' | 'police_or_references';

/** Same requirements as submit_for_review: both CNIC sides, a photo, and a certificate or two references. */
export function missingItems(s: DocumentsState): MissingItem[] {
  const missing: MissingItem[] = [];
  if (!s.cnicFront) missing.push('cnic_front');
  if (!s.cnicBack) missing.push('cnic_back');
  if (!s.profilePhoto) missing.push('profile_photo');
  if (!s.policeCert && s.references < 2) missing.push('police_or_references');
  return missing;
}

/** Up to two letters for the placeholder avatar. */
export function initials(name: string | null | undefined): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  const letters = parts.slice(0, 2).map((p) => Array.from(p)[0] ?? '');
  return letters.join('').toUpperCase();
}
