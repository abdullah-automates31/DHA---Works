// Pure rules and the call for W14 Report a problem (unit tested). file_report stores the report for DHA staff; the
// database decides whether the job can still be reported (from scheduled until 7 days after completion).
import { MAX_FILE_BYTES } from '../documents/files.ts';

export type ReportKind = 'unsafe' | 'cash_price' | 'no_show' | 'poor_work' | 'rude_damage' | 'other';

// The five choices of the design, in order, and the report kind each one is filed as.
export const REPORT_CHOICES = [
  { id: 'rude', label: 'Customer rude', kind: 'rude_damage' },
  { id: 'unsafe', label: 'I felt unsafe', kind: 'unsafe' },
  { id: 'absent', label: 'Not at home', kind: 'no_show' },
  { id: 'unpaid', label: 'Refused to pay', kind: 'cash_price' },
  { id: 'other', label: 'Other', kind: 'other' },
] as const;
export type ReportChoiceId = (typeof REPORT_CHOICES)[number]['id'];

export function choiceById(id: ReportChoiceId | null | undefined) {
  return REPORT_CHOICES.find((c) => c.id === id) ?? null;
}

/** The screen opens on "I felt unsafe" from the red button on W12 (?kind=unsafe), otherwise nothing is chosen. */
export function initialChoice(param: string | null | undefined): ReportChoiceId | null {
  return param === 'unsafe' ? 'unsafe' : null;
}

export const DETAILS_MAX = 1000;
export const MAX_PHOTOS = 3;

export function tidyDetails(raw: string): string {
  return raw.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, DETAILS_MAX);
}

export type ReportCheck = { ok: true } | { ok: false; missing: 'choice' | 'details' };

/** A reason must be chosen; "Other" also needs a few words, because staff would otherwise have nothing to read. */
export function checkReport(choice: ReportChoiceId | null, details: string): ReportCheck {
  if (!choice) return { ok: false, missing: 'choice' };
  if (choice === 'other' && tidyDetails(details).length < 5) return { ok: false, missing: 'details' };
  return { ok: true };
}

/** The text stored with the report keeps the chosen reason, then the worker's own words. */
export function reportText(choice: ReportChoiceId, details: string): string {
  const label = choiceById(choice)?.label ?? '';
  const body = tidyDetails(details);
  return body === '' ? label : `${label}: ${body}`;
}

// ---------------------------------------------------------------- photos
const PHOTO_MIMES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
export type Photo = { bytes: ArrayBuffer; mime: string };

export function checkPhoto(mime: string | null | undefined, bytes: number): { ok: true; extension: string } | { ok: false; key: 'report.errors.photoType' | 'report.errors.photoSize' | 'report.errors.photoEmpty' } {
  const extension = PHOTO_MIMES[(mime ?? '').toLowerCase()];
  if (!extension) return { ok: false, key: 'report.errors.photoType' };
  if (bytes <= 0) return { ok: false, key: 'report.errors.photoEmpty' };
  if (bytes > MAX_FILE_BYTES) return { ok: false, key: 'report.errors.photoSize' };
  return { ok: true, extension };
}

/** "<worker id>/<job id>-<time>-<random>.<ext>": file_report keeps only paths under the reporter's own folder. */
export function buildPhotoPath(userId: string, jobId: string, extension: string, now: number, random: string): string {
  return `${userId}/${jobId}-${now}-${random}.${extension}`;
}

// ---------------------------------------------------------------- the call
export type ReportErrorKey =
  | 'report.errors.notAllowed'
  | 'report.errors.ended'
  | 'report.errors.suspended'
  | 'report.errors.photoType'
  | 'report.errors.photoSize'
  | 'report.errors.photoEmpty'
  | 'report.errors.photoUpload'
  | 'report.errors.network'
  | 'report.errors.generic';

type Err = { name?: string; message?: string } | null | undefined;

export function reportErrorKey(error: Err): ReportErrorKey {
  const text = `${error?.name ?? ''} ${error?.message ?? ''}`.toLowerCase();
  if (text.includes('reporting period')) return 'report.errors.ended';
  if (text.includes('reports are possible') || text.includes('job not found')) return 'report.errors.notAllowed';
  if (text.includes('suspended')) return 'report.errors.suspended';
  if (text.includes('network') || text.includes('fetch') || error?.name === 'TypeError') return 'report.errors.network';
  return 'report.errors.generic';
}

export type ReportClient = {
  uploadPhoto(path: string, bytes: ArrayBuffer, mime: string): PromiseLike<{ error: Err }>;
  file(jobId: string, kind: ReportKind, text: string, photoPaths: string[]): PromiseLike<{ error: Err }>;
};
export type ReportResult = { ok: true } | { ok: false; key: ReportErrorKey };

export type ReportInput = {
  userId: string;
  jobId: string;
  choice: ReportChoiceId;
  details: string;
  photos: Photo[];
  now?: number;
  random?: () => string;
};

/**
 * Checks the photos, uploads them to report-media, then files the report with their paths. A photo that cannot be
 * uploaded stops the report (nothing is filed) so the worker can retry; the bucket has no owner delete rule, so a
 * photo uploaded before a later failure stays unreferenced in the worker's own private folder.
 */
export async function fileReport(client: ReportClient, input: ReportInput): Promise<ReportResult> {
  const choice = choiceById(input.choice);
  if (!choice) return { ok: false, key: 'report.errors.generic' };
  if (input.photos.length > MAX_PHOTOS) return { ok: false, key: 'report.errors.photoSize' };
  const checked = input.photos.map((p) => checkPhoto(p.mime, p.bytes.byteLength));
  for (const c of checked) if (!c.ok) return { ok: false, key: c.key };
  try {
    const paths: string[] = [];
    const now = input.now ?? Date.now();
    for (const [index, photo] of input.photos.entries()) {
      const c = checked[index];
      if (!c || !c.ok) continue;
      const random = (input.random ?? (() => Math.random().toString(16).slice(2, 10)))();
      const path = buildPhotoPath(input.userId, input.jobId, c.extension, now + index, random);
      const { error } = await client.uploadPhoto(path, photo.bytes, photo.mime.toLowerCase());
      if (error) return { ok: false, key: reportErrorKey(error) === 'report.errors.network' ? 'report.errors.network' : 'report.errors.photoUpload' };
      paths.push(path);
    }
    const { error } = await client.file(input.jobId, choice.kind, reportText(input.choice, input.details), paths);
    return error ? { ok: false, key: reportErrorKey(error) } : { ok: true };
  } catch (thrown) {
    return { ok: false, key: thrown instanceof Error && thrown.name === 'TypeError' ? 'report.errors.network' : 'report.errors.generic' };
  }
}
