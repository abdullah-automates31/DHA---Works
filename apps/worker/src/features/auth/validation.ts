// Pure input helpers for sign-in (unit tested with node --test).

/** Trims and lower-cases; Supabase treats emails case-insensitively. */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

// Deliberately simple: one @, no spaces, a dot in the domain. The server decides the rest.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function isValidEmail(raw: string): boolean {
  const email = normalizeEmail(raw);
  return email.length <= 254 && EMAIL_PATTERN.test(email);
}

export const OTP_LENGTH = 6;

/** Keeps digits only and caps the length, so pasted codes like "123 456" work. */
export function sanitizeOtp(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, OTP_LENGTH);
}

export function isCompleteOtp(code: string): boolean {
  return code.length === OTP_LENGTH;
}
