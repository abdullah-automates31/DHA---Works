// Pure input helpers for W02 "About you" (unit tested with node --test).
// Nothing here logs or returns the raw value in an error: CNIC and date of birth are sensitive.

// ---------------------------------------------------------------- name
const NAME_MAX = 100;

export function normalizeName(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}

/** A name needs at least one letter (any script) and a sane length. No other rule is invented. */
export function isValidName(raw: string): boolean {
  const name = normalizeName(raw);
  return name.length > 0 && name.length <= NAME_MAX && /\p{L}/u.test(name);
}

// ---------------------------------------------------------------- mobile (+92 and 10 digits)
const NATIONAL_LENGTH = 10;

/** Digits of a national number with a leading 0092, 92 or 0 removed; not length-limited. */
function stripNational(raw: string): string {
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('0092')) digits = digits.slice(4);
  else if (digits.startsWith('92') && digits.length > NATIONAL_LENGTH) digits = digits.slice(2);
  else if (digits.startsWith('0')) digits = digits.slice(1);
  return digits;
}

/** Cleans what is typed or pasted into the field next to the fixed "+92" chip: at most 10 digits. */
export function sanitizeNationalInput(raw: string): string {
  return stripNational(raw).slice(0, NATIONAL_LENGTH);
}

/** "3214567890" -> "321 4567890" (the grouping shown in the design). */
export function formatNational(digits: string): string {
  return digits.length <= 3 ? digits : `${digits.slice(0, 3)} ${digits.slice(3)}`;
}

/** A Pakistani mobile is 3 followed by 9 more digits (e.g. 3XX XXXXXXX). */
export function isValidNational(digits: string): boolean {
  return /^3\d{9}$/.test(digits);
}

/** Any common way of writing a Pakistani mobile -> "+923214567890", or null. */
export function normalizePkMobile(raw: string): string | null {
  const national = stripNational(raw); // not capped: a number that is too long is invalid, not trimmed
  return isValidNational(national) ? `+92${national}` : null;
}

/** "+923214567890" -> "321 4567890" for pre-filling the field. */
export function storedPhoneToField(stored: string | null | undefined): string {
  if (!stored) return '';
  return formatNational(sanitizeNationalInput(stored));
}

// ---------------------------------------------------------------- CNIC (#####-#######-#)
const CNIC_DIGITS = 13;

export function cnicDigits(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, CNIC_DIGITS);
}

export function formatCnic(raw: string): string {
  const d = cnicDigits(raw);
  if (d.length <= 5) return d;
  if (d.length <= 12) return `${d.slice(0, 5)}-${d.slice(5)}`;
  return `${d.slice(0, 5)}-${d.slice(5, 12)}-${d.slice(12)}`;
}

/** Same pattern the database enforces (profiles_cnic_format). */
export function isValidCnic(formatted: string): boolean {
  return /^[0-9]{5}-[0-9]{7}-[0-9]$/.test(formatted);
}

// ---------------------------------------------------------------- date of birth ("dd / mm / yyyy")
const DOB_DIGITS = 8;

export function dobDigits(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, DOB_DIGITS);
}

export function formatDob(raw: string): string {
  const d = dobDigits(raw);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)} / ${d.slice(2)}`;
  return `${d.slice(0, 2)} / ${d.slice(2, 4)} / ${d.slice(4)}`;
}

const MIN_YEAR = 1900;

/**
 * "14 / 03 / 1994" -> "1994-03-14", or null when it is not a real calendar date, is in the future,
 * or is before 1900. No minimum age is enforced (policy pending Shariq).
 */
export function parseDob(display: string, today: Date = new Date()): string | null {
  const d = dobDigits(display);
  if (d.length !== DOB_DIGITS) return null;
  const day = Number(d.slice(0, 2));
  const month = Number(d.slice(2, 4));
  const year = Number(d.slice(4));
  if (year < MIN_YEAR || month < 1 || month > 12 || day < 1) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  if (date.getTime() > todayUtc) return null;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** "1994-03-14" -> "14 / 03 / 1994" for pre-filling the field. */
export function isoToDobField(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  return m ? `${m[3]} / ${m[2]} / ${m[1]}` : '';
}

// ---------------------------------------------------------------- typing helper
/**
 * Re-formats a controlled field. When the user deletes a separator character ("-" or " / ") the digits
 * do not change, so the formatter would put it straight back and the cursor would be stuck;
 * in that case the last digit is removed instead.
 */
export function nextFormatted(
  previous: string,
  typed: string,
  digitsOf: (s: string) => string,
  format: (s: string) => string,
): string {
  if (typed.length < previous.length && digitsOf(typed) === digitsOf(previous)) {
    return format(digitsOf(typed).slice(0, -1));
  }
  return format(typed);
}

export type Gender = 'male' | 'female';
