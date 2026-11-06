// Settings and staff accounts (migration 0042).
import { arr, bool, int, isUuid, obj, str } from '../../lib/json.ts';

export type Category = { id: number; name: string; subtitle: string | null; active: boolean; workers: number };
export type Settings = {
  categories: Category[]; phases: { phase: number; active: boolean }[];
  helplineNumber: string; helplineEnabled: boolean; reportWindowDays: number; reviewWindowDays: number;
};

export function parseSettings(json: unknown): Settings | null {
  const o = obj(json);
  if (!o) return null;
  return {
    categories: arr(o.categories).flatMap((raw) => {
      const c = obj(raw);
      return c && typeof c.id === 'number' && str(c.name) ? [{ id: c.id, name: c.name as string, subtitle: str(c.subtitle), active: bool(c.active), workers: int(c.workers) }] : [];
    }),
    phases: arr(o.phases).flatMap((raw) => {
      const p = obj(raw);
      return p && typeof p.phase === 'number' ? [{ phase: p.phase, active: bool(p.active) }] : [];
    }),
    helplineNumber: str(o.helpline_number) ?? '',
    helplineEnabled: bool(o.helpline_enabled),
    reportWindowDays: int(o.report_window_days) || 7,
    reviewWindowDays: int(o.review_window_days) || 7,
  };
}

export type Staff = {
  admins: { id: string; name: string; email: string | null; createdAt: string; accountStatus: string; isMe: boolean }[];
  invites: { id: string; email: string; createdAt: string; expiresAt: string; expired: boolean }[];
};

export function parseStaff(json: unknown): Staff {
  const o = obj(json);
  return {
    admins: arr(o?.admins).flatMap((raw) => {
      const a = obj(raw);
      return a && isUuid(a.id) ? [{ id: a.id, name: str(a.name) ?? 'Staff member', email: str(a.email), createdAt: str(a.created_at) ?? '', accountStatus: str(a.account_status) ?? 'active', isMe: bool(a.is_me) }] : [];
    }),
    invites: arr(o?.invites).flatMap((raw) => {
      const i = obj(raw);
      return i && isUuid(i.id) && str(i.email) ? [{ id: i.id, email: i.email as string, createdAt: str(i.created_at) ?? '', expiresAt: str(i.expires_at) ?? '', expired: bool(i.expired) }] : [];
    }),
  };
}
