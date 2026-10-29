// Two references from DHA residents, the alternative to the police certificate (docs/USER-FLOWS.md).
// Temporary form: the design only mentions the option. Rules follow set_my_references: name and phone required.
import { isValidName, normalizeName, normalizePkMobile } from '../profile/validation.ts';

export type ReferenceInput = { name: string; phone: string; address: string };
export type ReferencePayload = { name: string; phone: string; address: string };

export type ReferenceFieldErrors = { name?: true; phone?: true; address?: true };

export function normalizeReference(r: ReferenceInput): ReferencePayload | null {
  const phone = normalizePkMobile(r.phone);
  if (!isValidName(r.name) || !phone || r.address.trim() === '') return null;
  return { name: normalizeName(r.name), phone, address: r.address.replace(/\s+/g, ' ').trim() };
}

export function referenceErrors(r: ReferenceInput): ReferenceFieldErrors {
  const errors: ReferenceFieldErrors = {};
  if (!isValidName(r.name)) errors.name = true;
  if (!normalizePkMobile(r.phone)) errors.phone = true;
  if (r.address.trim() === '') errors.address = true;
  return errors;
}

/** Both references must be complete and must not be the same person (same phone). */
export function validateReferences(
  refs: [ReferenceInput, ReferenceInput],
): { ok: true; payload: [ReferencePayload, ReferencePayload] } | { ok: false; reason: 'incomplete' | 'same' } {
  const a = normalizeReference(refs[0]);
  const b = normalizeReference(refs[1]);
  if (!a || !b) return { ok: false, reason: 'incomplete' };
  if (a.phone === b.phone) return { ok: false, reason: 'same' };
  return { ok: true, payload: [a, b] };
}
