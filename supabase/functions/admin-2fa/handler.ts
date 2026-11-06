// Admin second step: emails a one-time code to the signed-in admin (migration 0037, docs/SECURITY.md section 16).
//
// Security model:
//  * The Supabase gateway checks the caller's JWT (verify_jwt = true). This handler then reads the user id and the
//    session id from that token. The request body cannot name a user, a session or an address: the code goes only to
//    the email address that belongs to the token's own account.
//  * The code is made and checked inside the database (admin_issue_challenge / admin_verify_code). This function
//    never stores or logs it and never returns it: the response only says that a code was sent.
//  * Rate limits (1 per minute, 5 per hour per account), the 10-minute life and the 5-tries lock live in the database.

export type IssueResult =
  | { ok: true; code: string }
  | { ok: false; reason: "forbidden" | "too_soon" | "too_many" | "failed" };

export interface Deps {
  issue(userId: string, sessionId: string): Promise<IssueResult>;
  emailOf(userId: string): Promise<string | null>;
  sendMail(to: string, subject: string, text: string): Promise<boolean>;
  now: () => Date;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BODY_BYTES = 64;

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

export function readClaims(
  authorization: string | null,
  nowMs: number,
): { sub: string; session: string } | null {
  const m = /^Bearer ([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/.exec(
    authorization ?? "",
  );
  if (!m) return null;
  try {
    const b64 = m[2]!.replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(
      new TextDecoder().decode(
        Uint8Array.from(atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, "=")), (c) => c.charCodeAt(0)),
      ),
    ) as Record<string, unknown>;
    if (payload.role !== "authenticated") return null; // the anon key is not a signed-in user
    if (typeof payload.exp !== "number" || payload.exp * 1000 <= nowMs) return null;
    if (typeof payload.sub !== "string" || !UUID.test(payload.sub)) return null;
    if (typeof payload.session_id !== "string" || !UUID.test(payload.session_id)) return null;
    return { sub: payload.sub, session: payload.session_id };
  } catch {
    return null;
  }
}

export async function handle(req: Request, deps: Deps): Promise<Response> {
  if (req.method !== "POST") return json(405, { error: "method not allowed" });

  const claims = readClaims(req.headers.get("authorization"), deps.now().getTime());
  if (!claims) return json(401, { error: "unauthorized" });

  // Nothing in the body is used. Anything that tries to name a user, session or address is refused.
  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) return json(413, { error: "body too large" });
  if (raw.trim() !== "" && raw.trim() !== "{}") return json(400, { error: "no input is accepted" });

  const issued = await deps.issue(claims.sub, claims.session).catch((): IssueResult => ({ ok: false, reason: "failed" }));
  if (!issued.ok) {
    if (issued.reason === "forbidden") return json(403, { error: "not available" });
    if (issued.reason === "too_soon") return json(429, { error: "wait a minute before asking for another code" });
    if (issued.reason === "too_many") return json(429, { error: "too many codes requested; try again later" });
    return json(500, { error: "internal error" });
  }

  const to = await deps.emailOf(claims.sub).catch(() => null);
  if (!to) return json(500, { error: "internal error" });
  const sent = await deps.sendMail(
    to,
    "Your DHA Works admin code",
    `Your DHA Works admin sign-in code is ${issued.code}.\n\nIt works for 10 minutes. If you did not just sign in, do not share it: ask another administrator to review your account.`,
  ).catch(() => false);
  if (!sent) return json(502, { error: "could not send the code" });
  return json(200, { ok: true });
}

/**
 * Local development only: instead of emailing, the function may print the code to its own console so the sign-in can
 * be tried without a mail provider. It is refused whenever the project URL is a hosted Supabase address (or unknown).
 */
export function devMailAllowed(mode: string | undefined, supabaseUrl: string | undefined): boolean {
  if (mode !== "dev-log" || !supabaseUrl) return false;
  try {
    const host = new URL(supabaseUrl).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "kong" || host === "host.docker.internal" || host.endsWith(".internal");
  } catch {
    return false;
  }
}
