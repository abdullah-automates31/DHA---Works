import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  amountDigits,
  buildSubmitArgs,
  computeTotal,
  dayLabel,
  defaultVisit,
  isQuoteValid,
  isWindowAvailable,
  parseAmount,
  validateQuote,
  visitText,
  visitWindow,
  windowLabel,
  windowRange,
  type QuoteInput,
} from './rules.ts';

const empty: QuoteInput = { labour: '', materials: '', materialsNote: '', other: '', otherNote: '' };
const design: QuoteInput = { labour: '1500', materials: '1450', materialsNote: 'Trap pipe, flexible hose, washers', other: '250', otherNote: 'Fittings and washers' };
const sat9am = new Date(2026, 9, 24, 9, 0); // Sat 24 Oct 2026, 9 AM

test('amounts keep digits only, at most seven', () => {
  assert.equal(amountDigits('Rs 1,500'), '1500');
  assert.equal(amountDigits('123456789'), '1234567');
  assert.equal(parseAmount(''), 0);
  assert.equal(parseAmount('  '), 0);
  assert.equal(parseAmount('1,450'), 1450);
});

test('the preview total is the sum of the three amounts (the database computes the real one)', () => {
  assert.equal(computeTotal(design), 3200);
  assert.equal(computeTotal(empty), 0);
  assert.equal(computeTotal({ labour: '800', materials: '', other: '' }), 800);
});

test('validation mirrors the table constraints: total above zero, a note for "other"', () => {
  assert.deepEqual(validateQuote(empty), { total: true });
  assert.deepEqual(validateQuote(design), {});
  assert.deepEqual(validateQuote({ ...design, otherNote: '   ' }), { otherNote: true });
  assert.deepEqual(validateQuote({ ...design, other: '', otherNote: '' }), {});
  assert.deepEqual(validateQuote({ ...empty, other: '100' }), { otherNote: true });
  assert.equal(isQuoteValid({ ...empty, materials: '500' }), true); // labour 0 is allowed while the total is above zero
  assert.equal(isQuoteValid(empty), false);
  assert.equal(isQuoteValid({ ...design, otherNote: '' }), false);
});

test('the materials list is optional', () => {
  assert.equal(isQuoteValid({ ...design, materialsNote: '' }), true);
});

test('visit windows are two hours long, in local time', () => {
  const w = visitWindow(sat9am, 0, 1);
  assert.equal(w.start.getHours(), 11);
  assert.equal(w.end.getHours(), 13);
  assert.equal(w.start.getDate(), 24);
  assert.equal(visitWindow(sat9am, 2, 0).start.getDate(), 26);
  assert.equal(visitWindow(new Date(2026, 9, 31, 9), 1, 0).start.getMonth(), 10); // rolls into November
});

test('windows that already started cannot be chosen', () => {
  assert.equal(isWindowAvailable(sat9am, 0, 0), false); // 8 AM has passed at 9 AM
  assert.equal(isWindowAvailable(sat9am, 0, 1), true); // 11 AM
  assert.equal(isWindowAvailable(sat9am, 1, 0), true); // tomorrow 8 AM
  assert.equal(isWindowAvailable(new Date(2026, 9, 24, 11, 0), 0, 1), false); // starts exactly now: not in the future
});

test('the default is the first window that can still be chosen', () => {
  assert.deepEqual(defaultVisit(sat9am), { day: 0, window: 1 });
  assert.deepEqual(defaultVisit(new Date(2026, 9, 24, 6, 0)), { day: 0, window: 0 });
  assert.deepEqual(defaultVisit(new Date(2026, 9, 24, 19, 0)), { day: 1, window: 0 }); // all of today has passed
});

test('labels read like the design', () => {
  assert.equal(dayLabel(sat9am, 0), 'Today');
  assert.equal(dayLabel(sat9am, 1), 'Sun 25');
  assert.equal(dayLabel(sat9am, 4), 'Wed 28');
  assert.deepEqual([0, 1, 2, 3, 4].map(windowLabel), ['8 AM', '11 AM', '2 PM', '4 PM', '6 PM']);
  assert.deepEqual([0, 1, 2, 3, 4].map(windowRange), ['8 to 10 AM', '11 AM to 1 PM', '2 to 4 PM', '4 to 6 PM', '6 to 8 PM']);
  assert.equal(visitText(sat9am, 0, 1), 'Sat 24 Oct, 11 AM to 1 PM');
});

test('the request carries amounts and visit times, never a total', () => {
  const args = buildSubmitArgs('job-1', design, sat9am, 1, 2);
  assert.equal(args.p_job_id, 'job-1');
  assert.equal(args.p_labour, 1500);
  assert.equal(args.p_materials, 1450);
  assert.equal(args.p_materials_note, 'Trap pipe, flexible hose, washers');
  assert.equal(args.p_other_amount, 250);
  assert.equal(args.p_other_note, 'Fittings and washers');
  assert.equal(args.p_note, undefined);
  assert.equal(new Date(args.p_visit_start).getHours(), 14);
  assert.equal(new Date(args.p_visit_end).getHours(), 16);
  assert.equal(new Date(args.p_visit_start).getDate(), 25);
  assert.ok(!('p_total' in args));
});

test('notes travel only with their amounts and are tidied', () => {
  const args = buildSubmitArgs('j', { labour: '900', materials: '', materialsNote: 'unused', other: '', otherNote: 'unused' }, sat9am, 0, 1);
  assert.equal(args.p_materials, 0);
  assert.equal(args.p_materials_note, undefined);
  assert.equal(args.p_other_amount, 0);
  assert.equal(args.p_other_note, undefined);
  const spaced = buildSubmitArgs('j', { ...design, materialsNote: '  Trap   pipe ', otherNote: ' Fittings   and washers ' }, sat9am, 0, 1);
  assert.equal(spaced.p_materials_note, 'Trap pipe');
  assert.equal(spaced.p_other_note, 'Fittings and washers');
  const noList = buildSubmitArgs('j', { ...design, materialsNote: '   ' }, sat9am, 0, 1);
  assert.equal(noList.p_materials_note, undefined);
});
