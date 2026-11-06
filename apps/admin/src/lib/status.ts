export type SessionStatus = 'verified' | 'needs_code' | 'not_admin';

/** Only the two known statuses are trusted; anything else is treated as "not an admin". */
export function parseStatus(value: unknown): SessionStatus {
  return value === 'verified' || value === 'needs_code' ? value : 'not_admin';
}
