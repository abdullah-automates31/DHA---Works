// Pure rules for W03b "Your work" (unit tested with node --test).

export const MAX_VOICE_MS = 30_000; // design: "0:18 / 0:30"; the recording stops by itself at 30 s
export const MIN_VOICE_MS = 1_000; // anything shorter is treated as an accidental tap and discarded

// Speech needs far less than the HIGH_QUALITY preset (44.1 kHz stereo, 128 kbps = about 480 KB for 30 s). Mono at
// 16 kHz and 32 kbps AAC is clear for a voice and about 120 KB for 30 s.
export const VOICE_SAMPLE_RATE = 16_000;
export const VOICE_CHANNELS = 1;
export const VOICE_BIT_RATE = 32_000;

/** Rough size of a recording of `ms` milliseconds at the voice bit rate (container overhead ignored). */
export function estimateVoiceBytes(ms: number): number {
  return Math.round((VOICE_BIT_RATE / 8) * (ms / 1000));
}
export const MAX_VOICE_BYTES = 5 * 1024 * 1024; // the worker-media bucket limit
export const VOICE_MIME = 'audio/mp4'; // m4a (AAC); the bucket allows audio/mp4, audio/m4a, audio/mpeg, audio/aac

// ---------------------------------------------------------------- numbers
export function digitsOnly(raw: string, maxLength: number): string {
  return raw.replace(/\D/g, '').slice(0, maxLength);
}

export type Optional<T> = { ok: true; value: T | null } | { ok: false };

/** Years of experience: blank is allowed (left unset); otherwise a whole number from 0 to 70 (database check). */
export function parseYears(raw: string): Optional<number> {
  const text = raw.trim();
  if (text === '') return { ok: true, value: null };
  if (!/^\d{1,2}$/.test(text)) return { ok: false };
  const value = Number(text);
  return value <= 70 ? { ok: true, value } : { ok: false };
}

/** Visit fee in whole rupees: blank is allowed (stays 0 = no visit fee); otherwise 0 to 9,999,999 (sanity limit). */
export function parseFee(raw: string): Optional<number> {
  const text = raw.trim();
  if (text === '') return { ok: true, value: null };
  if (!/^\d{1,7}$/.test(text)) return { ok: false };
  return { ok: true, value: Number(text) };
}

// ---------------------------------------------------------------- about text
export const ABOUT_MAX = 500; // the database check on worker_details.about

/** Keeps what the worker types within the limit. Line breaks are allowed. */
export function limitAbout(raw: string): string {
  return raw.slice(0, ABOUT_MAX);
}

/** True when the box differs from what is saved (blank and missing count as the same). */
export function aboutChanged(typed: string, saved: string | null): boolean {
  return typed.trim() !== (saved ?? '').trim();
}

// ---------------------------------------------------------------- trades
export function toggleTrade(selected: readonly number[], id: number): number[] {
  return selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
}

// ---------------------------------------------------------------- voice
/** 18000 -> "0:18", 5400 -> "0:05", 61000 -> "1:01". */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export type VoiceCheck = { ok: true } | { ok: false; reason: 'tooShort' | 'tooLarge' | 'empty' };

export function checkVoice(bytes: number, durationMs: number): VoiceCheck {
  if (bytes <= 0) return { ok: false, reason: 'empty' };
  if (durationMs < MIN_VOICE_MS) return { ok: false, reason: 'tooShort' };
  if (bytes > MAX_VOICE_BYTES) return { ok: false, reason: 'tooLarge' };
  return { ok: true };
}

/** "<user id>/voice_intro-<time>-<random>.m4a": the first folder must be the user id (storage policy + RPC check). */
export function buildVoicePath(userId: string, now: number, random: string): string {
  return `${userId}/voice_intro-${now}-${random}.m4a`;
}

/** Fraction (0 to 1) of the 30 s window that has been recorded, for filling the waveform bars. */
export function voiceProgress(ms: number): number {
  return Math.min(1, Math.max(0, ms / MAX_VOICE_MS));
}
