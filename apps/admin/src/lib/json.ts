// Small checked readers for the JSON that the database functions return (migrations 0038 to 0042). A reply that does
// not look right becomes null, zero or an empty list instead of reaching a screen unchecked.
export type Obj = Record<string, unknown>;

export const obj = (v: unknown): Obj | null => (v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : null);
export const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
export const num = (v: unknown): number | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  // numeric columns (a rating such as 4.50) can arrive as a string
  if (typeof v === 'string' && /^-?[0-9]+(\.[0-9]+)?$/.test(v)) return Number(v);
  return null;
};
export const int = (v: unknown): number => num(v) ?? 0;
export const bool = (v: unknown): boolean => v === true;
export const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
export const nums = (v: unknown): number[] => (Array.isArray(v) ? v.map(num).filter((x): x is number => x !== null) : []);
export const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);

/** A page of a list: `{ total, rows }`. Rows the mapper rejects (returns null) are dropped. */
export function page<T>(json: unknown, map: (row: Obj) => T | null): { total: number; rows: T[] } {
  const o = obj(json);
  const rows: T[] = [];
  for (const raw of arr(o?.rows)) {
    const r = obj(raw);
    const mapped = r ? map(r) : null;
    if (mapped) rows.push(mapped);
  }
  return { total: int(o?.total), rows };
}

/** A storage path is only used if it is a plain "<uuid>/<file>" path: no traversal, no absolute path. */
export function safePath(path: unknown): path is string {
  return typeof path === 'string' && /^[0-9a-f-]{36}\/[A-Za-z0-9._-]{1,200}$/i.test(path) && !path.includes('..');
}
