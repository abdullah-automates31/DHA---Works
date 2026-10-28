// Push dispatcher. Reads notifications that have no push_sent_at, finds the owner's device tokens and
// sends them through the Expo push service.
//
// Security model:
//  * Callable only with the shared secret in the x-push-secret header (server to server: pg_cron / webhook).
//    It is never called from an app, so verify_jwt is off in config.toml and the secret is the gate.
//  * The request cannot name a recipient. Recipients come from notifications.user_id in the database, and
//    only that user's own tokens are used.
//  * The service role key is read from the function's own environment and never leaves it.

import {
  buildMessage,
  chunk,
  deadTokens,
  type ExpoTicket,
  isValidExpoToken,
  MAX_BATCH,
  MAX_BODY_BYTES,
  parseRequest,
  timingSafeEqual,
} from "./lib.ts";

export interface NotificationRow {
  id: string;
  user_id: string;
  type: string;
  job_id: string | null;
  payload: unknown;
}
export interface TokenRow {
  user_id: string;
  push_token: string;
}

export interface Store {
  listUnsent(limit: number, sinceIso: string): Promise<NotificationRow[]>;
  /** Marks one row as sent. True only for the caller that won the race, so a row is never sent twice. */
  claim(id: string): Promise<boolean>;
  /** Puts rows back so the next run retries them (used after a transient Expo failure). */
  release(ids: string[]): Promise<void>;
  /** Tokens of the given users, only for active accounts. */
  tokensFor(userIds: string[]): Promise<TokenRow[]>;
  deleteTokens(tokens: string[]): Promise<void>;
}

export interface Deps {
  store: Store;
  fetch: typeof fetch;
  secret: string | undefined;
  expoUrl: string;
  expoAccessToken?: string;
  now: () => Date;
}

const MAX_AGE_MS = 24 * 60 * 60 * 1000; // a day-old push is no longer useful

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

export async function handle(req: Request, deps: Deps): Promise<Response> {
  if (req.method !== "POST") return json(405, { error: "method not allowed" });

  // Fail closed when the secret is not configured.
  if (!deps.secret) {
    console.error("send-push: PUSH_DISPATCH_SECRET is not set");
    return json(500, { error: "not configured" });
  }
  const given = req.headers.get("x-push-secret") ?? "";
  if (!timingSafeEqual(given, deps.secret)) {
    return json(401, { error: "unauthorized" });
  }

  try {
    const declared = Number(req.headers.get("content-length") ?? "0");
    if (declared > MAX_BODY_BYTES) {
      return json(413, { error: "body too large" });
    }
    const raw = await req.text();
    if (raw.length > MAX_BODY_BYTES) {
      return json(413, { error: "body too large" });
    }
    const parsed = parseRequest(raw);
    if (!parsed.ok) return json(400, { error: parsed.error });

    const since = new Date(deps.now().getTime() - MAX_AGE_MS).toISOString();
    const candidates = await deps.store.listUnsent(parsed.limit, since);

    const claimed: NotificationRow[] = [];
    for (const row of candidates) {
      if (await deps.store.claim(row.id)) claimed.push(row);
    }
    if (claimed.length === 0) {
      return json(200, { processed: 0, sent: 0, failed: 0, removed_tokens: 0 });
    }

    const userIds = [...new Set(claimed.map((r) => r.user_id))];
    const tokens = await deps.store.tokensFor(userIds);
    const tokensByUser = new Map<string, string[]>();
    for (const t of tokens) {
      if (!isValidExpoToken(t.push_token)) continue; // never forward junk to Expo
      tokensByUser.set(t.user_id, [
        ...(tokensByUser.get(t.user_id) ?? []),
        t.push_token,
      ]);
    }

    type Msg = { notificationId: string; message: Record<string, unknown> };
    const outgoing: Msg[] = [];
    for (const row of claimed) {
      const { title, body } = buildMessage(row.type, row.payload);
      for (const to of tokensByUser.get(row.user_id) ?? []) {
        outgoing.push({
          notificationId: row.id,
          message: {
            to,
            title,
            body,
            sound: "default",
            channelId: "default",
            data: { notificationId: row.id, type: row.type, jobId: row.job_id },
          },
        });
      }
    }

    let sent = 0;
    let failed = 0;
    const dead = new Set<string>();
    const retry = new Set<string>();

    for (const batch of chunk(outgoing, MAX_BATCH)) {
      const headers: Record<string, string> = {
        "content-type": "application/json",
        accept: "application/json",
      };
      if (deps.expoAccessToken) {
        headers.authorization = `Bearer ${deps.expoAccessToken}`;
      }
      try {
        const res = await deps.fetch(deps.expoUrl, {
          method: "POST",
          headers,
          body: JSON.stringify(batch.map((m) => m.message)),
          signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) {
          failed += batch.length;
          // Server-side trouble or rate limit: try again next run. Other 4xx will not improve, so do not loop.
          if (res.status >= 500 || res.status === 429) {
            batch.forEach((m) => retry.add(m.notificationId));
          }
          continue;
        }
        const payload = await res.json().catch(() => null) as {
          data?: ExpoTicket[];
        } | null;
        const tickets = Array.isArray(payload?.data) ? payload!.data! : [];
        const batchTokens = batch.map((m) => String(m.message.to));
        deadTokens(batchTokens, tickets).forEach((t) => dead.add(t));
        tickets.forEach((t) => (t?.status === "ok" ? sent++ : failed++));
        if (tickets.length < batch.length) {
          failed += batch.length - tickets.length;
        }
      } catch {
        failed += batch.length;
        batch.forEach((m) => retry.add(m.notificationId));
      }
    }

    if (dead.size > 0) await deps.store.deleteTokens([...dead]);
    if (retry.size > 0) await deps.store.release([...retry]);

    // Counts only: no tokens, user ids or message text in the response or logs.
    return json(200, {
      processed: claimed.length,
      sent,
      failed,
      removed_tokens: dead.size,
    });
  } catch (err) {
    console.error(
      "send-push failed:",
      err instanceof Error ? err.name : "unknown error",
    );
    return json(500, { error: "internal error" });
  }
}
