// Pure input helpers for sign-in (unit tested with node --test).

import {
  formatNational,
  normalizePkMobile,
  sanitizeNationalInput,
  storedPhoneToField,
} from '../profile/validation.ts';

export { formatNational, sanitizeNationalInput, storedPhoneToField };

/** Any common way of writing a Pakistani mobile -> "+923214567890", or null. */
export function normalizePhone(raw: string): string | null {
  return normalizePkMobile(raw);
}

export function isValidPhone(raw: string): boolean {
  return normalizePhone(raw) !== null;
}

/** "+923214567890" -> "+92 321 4567890" for display. */
export function formatPhoneDisplay(phone: string): string {
  const match = /^\+92(3\d{2})(\d{7})$/.exec(phone);
  return match ? `+92 ${match[1]} ${match[2]}` : phone;
}

/** "+923214567890" or "923214567890" -> "+92 321 ***7890": enough to recognise, not enough to copy in full. */
export function maskPhone(phone: string): string {
  const normalized = normalizePhone(phone) ?? phone;
  const match = /^\+92(3\d{2})(\d{3})(\d{4})$/.exec(normalized);
  return match ? `+92 ${match[1]} ***${match[3]}` : normalized;
}

export const OTP_LENGTH = 6;

/** Keeps digits only and caps the length, so pasted codes like "123 456" work. */
export function sanitizeOtp(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, OTP_LENGTH);
}

export function isCompleteOtp(code: string): boolean {
  return code.length === OTP_LENGTH;
}
