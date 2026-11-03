// Pure rules for W10 Create quote (unit tested with node --test). The database is the authority: it computes the
// total and re-checks everything (submit_quote and the quotes table constraints). These rules only guide the form
// and build the request; the preview total is display only.

const MAX_DIGITS = 7; // sanity limit on one amount (Rs 9,999,999); the database only needs a non-negative integer

export const WINDOW_STARTS = [8, 11, 14, 16, 18] as const; // 2-hour visit windows, as in the design
export const WINDOW_HOURS = 2;
export const DAY_COUNT = 5; // today and the next four days

export function amountDigits(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, MAX_DIGITS);
}

/** "" -> 0 (blank counts as nothing); digits -> the whole rupee amount. */
export function parseAmount(raw: string): number {
  const digits = amountDigits(raw);
  return digits === '' ? 0 : Number(digits);
}

export const MAX_ITEMS = 10;
export const ITEM_NAME_MAX = 40;

export type MaterialItem = { name: string; price: string };

/** The toggle decides whether materials count at all; the items are kept while it is off so a tap back loses nothing. */
export type QuoteInput = {
  labour: string;
  withMaterials: boolean;
  items: MaterialItem[];
};

const itemUsed = (item: MaterialItem) => item.name.trim() !== '' || parseAmount(item.price) > 0;
const itemComplete = (item: MaterialItem) => item.name.trim() !== '' && parseAmount(item.price) > 0;

/** Rows the worker actually started (blank rows are ignored). */
export function usedItems(input: Pick<QuoteInput, 'withMaterials' | 'items'>): MaterialItem[] {
  return input.withMaterials ? input.items.filter(itemUsed) : [];
}

/** The materials cost is worked out from the item prices; it is never typed. 0 when "Without materials". */
export function materialsTotal(input: Pick<QuoteInput, 'withMaterials' | 'items'>): number {
  return usedItems(input).reduce((sum, item) => sum + parseAmount(item.price), 0);
}

export function computeTotal(input: Pick<QuoteInput, 'labour' | 'withMaterials' | 'items'>): number {
  return parseAmount(input.labour) + materialsTotal(input);
}

export type QuoteErrors = {
  total?: true; // nothing entered: the total must be above zero
  items?: true; // "With materials" needs at least one item, and every started row needs a name and a price
};

/** Mirrors the table rule (total above zero) plus the form rule for the materials list. */
export function validateQuote(input: QuoteInput): QuoteErrors {
  const errors: QuoteErrors = {};
  if (computeTotal(input) <= 0) errors.total = true;
  if (input.withMaterials) {
    const used = usedItems(input);
    if (used.length === 0 || !used.every(itemComplete)) errors.items = true;
  }
  return errors;
}

export function isQuoteValid(input: QuoteInput): boolean {
  const errors = validateQuote(input);
  return !errors.total && !errors.items;
}

// ---------------------------------------------------------------- visit day and time
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function dayStart(now: Date, offset: number): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
}

/** Start and end of a visit window on a day (offset 0 = today), in the phone's local time. */
export function visitWindow(now: Date, dayOffset: number, windowIndex: number): { start: Date; end: Date } {
  const base = dayStart(now, dayOffset);
  const hour = WINDOW_STARTS[windowIndex] ?? WINDOW_STARTS[0];
  return {
    start: new Date(base.getFullYear(), base.getMonth(), base.getDate(), hour),
    end: new Date(base.getFullYear(), base.getMonth(), base.getDate(), hour + WINDOW_HOURS),
  };
}

/** A window is selectable only while its start is still in the future (the database refuses a visit in the past). */
export function isWindowAvailable(now: Date, dayOffset: number, windowIndex: number): boolean {
  return visitWindow(now, dayOffset, windowIndex).start.getTime() > now.getTime();
}

/** The first day and window that can still be chosen. */
export function defaultVisit(now: Date): { day: number; window: number } {
  for (let day = 0; day < DAY_COUNT; day++) {
    for (let window = 0; window < WINDOW_STARTS.length; window++) {
      if (isWindowAvailable(now, day, window)) return { day, window };
    }
  }
  return { day: DAY_COUNT - 1, window: 0 };
}

/** "Today", "Sun 25", "Mon 26" for the day pills. */
export function dayLabel(now: Date, dayOffset: number): string {
  if (dayOffset === 0) return 'Today';
  const d = dayStart(now, dayOffset);
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()}`;
}

function hourText(hour: number): { n: number; period: 'AM' | 'PM' } {
  return { n: hour % 12 === 0 ? 12 : hour % 12, period: hour < 12 ? 'AM' : 'PM' };
}

/** "8 AM", "11 AM", "2 PM" for the time pills. */
export function windowLabel(windowIndex: number): string {
  const { n, period } = hourText(WINDOW_STARTS[windowIndex] ?? WINDOW_STARTS[0]);
  return `${n} ${period}`;
}

/** "11 AM to 1 PM", "2 to 4 PM" for the preview. */
export function windowRange(windowIndex: number): string {
  const startHour = WINDOW_STARTS[windowIndex] ?? WINDOW_STARTS[0];
  const a = hourText(startHour);
  const b = hourText(startHour + WINDOW_HOURS);
  return a.period === b.period ? `${a.n} to ${b.n} ${b.period}` : `${a.n} ${a.period} to ${b.n} ${b.period}`;
}

/** "Sat 24 Oct, 11 AM to 1 PM". */
export function visitText(now: Date, dayOffset: number, windowIndex: number): string {
  const d = dayStart(now, dayOffset);
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}, ${windowRange(windowIndex)}`;
}

// ---------------------------------------------------------------- the request
export type SubmitQuoteArgs = {
  p_job_id: string;
  p_labour: number;
  p_visit_start: string;
  p_visit_end: string;
  p_materials: number;
  p_materials_note: string | undefined;
  p_other_amount: number;
  p_other_note: string | undefined;
  p_note: undefined;
};

/**
 * The materials amount is the sum of the item prices and the list goes in the note ("Pipe Rs 500; Tape Rs 50").
 * "Other" charges are no longer part of a quote: they are always sent as 0. No total is ever sent.
 */
export function buildSubmitArgs(jobId: string, input: QuoteInput, now: Date, dayOffset: number, windowIndex: number): SubmitQuoteArgs {
  const { start, end } = visitWindow(now, dayOffset, windowIndex);
  const materials = materialsTotal(input);
  const collapse = (text: string) => text.replace(/\s+/g, ' ').trim();
  const list = usedItems(input)
    .map((item) => `${collapse(item.name)} Rs ${parseAmount(item.price)}`)
    .join('; ');
  return {
    p_job_id: jobId,
    p_labour: parseAmount(input.labour),
    p_visit_start: start.toISOString(),
    p_visit_end: end.toISOString(),
    p_materials: materials,
    p_materials_note: materials > 0 && list !== '' ? list : undefined,
    p_other_amount: 0,
    p_other_note: undefined,
    p_note: undefined,
  };
}
