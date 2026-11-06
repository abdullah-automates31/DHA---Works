import { assert, assertEquals, assertFalse } from "@std/assert";
import { type Deps, handle, type IssueResult, readClaims } from "./handler.ts";

const NOW = new Date("2026-11-07T10:00:00Z");
const USER = "00000000-0000-4000-8000-0000000000a1";
const SESSION = "00000000-0000-4000-8000-00000000a101";

function b64(o: unknown) {
  return btoa(JSON.stringify(o)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function token(claims: Record<string, unknown>) {
  return `Bearer ${b64({ alg: "HS256" })}.${b64(claims)}.${"s".repeat(10)}`;
}
const good = () => token({ sub: USER, role: "authenticated", session_id: SESSION, exp: NOW.getTime() / 1000 + 600 });

function fake(over: Partial<Deps> = {}, issued: IssueResult = { ok: true, code: "482913" }) {
  const calls = { issue: [] as string[][], mail: [] as string[][], email: [] as string[] };
  const deps: Deps = {
    now: () => NOW,
    issue: (u, s) => { calls.issue.push([u, s]); return Promise.resolve(issued); },
    emailOf: (u) => { calls.email.push(u); return Promise.resolve("staff@dha-works.example"); },
    sendMail: (to, subject, text) => { calls.mail.push([to, subject, text]); return Promise.resolve(true); },
    ...over,
  };
  return { deps, calls };
}
const post = (auth: string | null, body = "") =>
  new Request("https://x/functions/v1/admin-2fa", { method: "POST", headers: auth ? { authorization: auth } : {}, body: body || undefined });

Deno.test("no token, a malformed token and a junk token are refused and nothing is issued", async () => {
  const { deps, calls } = fake();
  for (const a of [null, "", "Bearer", "Bearer abc", "Bearer a.b.c", "Basic x.y.z", "bearer " + good().slice(7)]) {
    assertEquals((await handle(post(a), deps)).status, 401, String(a));
  }
  assertEquals(calls.issue.length, 0);
  assertEquals(calls.mail.length, 0);
});

Deno.test("the anon key, an expired token, and tokens without a user or session are refused", async () => {
  const { deps, calls } = fake();
  const exp = NOW.getTime() / 1000 + 600;
  for (const c of [
    { sub: USER, role: "anon", session_id: SESSION, exp },
    { sub: USER, role: "service_role", session_id: SESSION, exp },
    { sub: USER, role: "authenticated", session_id: SESSION, exp: NOW.getTime() / 1000 - 1 },
    { role: "authenticated", session_id: SESSION, exp },
    { sub: USER, role: "authenticated", exp },
    { sub: "not-a-uuid", role: "authenticated", session_id: SESSION, exp },
    { sub: USER, role: "authenticated", session_id: "x'; drop table--", exp },
  ]) assertEquals((await handle(post(token(c)), deps)).status, 401, JSON.stringify(c));
  assertEquals(calls.issue.length, 0);
});

Deno.test("only POST is allowed", async () => {
  const { deps } = fake();
  for (const m of ["GET", "PUT", "DELETE", "PATCH"]) {
    assertEquals((await handle(new Request("https://x/", { method: m, headers: { authorization: good() } }), deps)).status, 405);
  }
});

Deno.test("the body cannot name another user, session or address", async () => {
  const { deps, calls } = fake();
  for (const body of [
    '{"user_id":"00000000-0000-4000-8000-0000000000ff"}',
    '{"email":"attacker@evil.example"}',
    '{"session_id":"00000000-0000-4000-8000-0000000000ee"}',
    "[1]", "x",
  ]) assertEquals((await handle(post(good(), body), deps)).status, 400, body);
  assertEquals((await handle(post(good(), "x".repeat(200)), deps)).status, 413);
  assertEquals(calls.issue.length, 0);
  assertEquals(calls.mail.length, 0);
});

Deno.test("a valid call asks the database for the token's own user and session and mails only that account's address", async () => {
  const { deps, calls } = fake();
  const res = await handle(post(good(), "{}"), deps);
  assertEquals(res.status, 200);
  assertEquals(calls.issue, [[USER, SESSION]]);
  assertEquals(calls.email, [USER]);
  assertEquals(calls.mail.length, 1);
  assertEquals(calls.mail[0]![0], "staff@dha-works.example");
  assert(calls.mail[0]![2]!.includes("482913"), "the code is in the email");
});

Deno.test("the response never contains the code", async () => {
  const { deps } = fake();
  const res = await handle(post(good()), deps);
  const text = await res.text();
  assertFalse(text.includes("482913"));
  assertEquals(JSON.parse(text), { ok: true });
  assertEquals(res.headers.get("cache-control"), "no-store");
});

Deno.test("database refusals map to the right status and send no mail", async () => {
  for (const [reason, status] of [["forbidden", 403], ["too_soon", 429], ["too_many", 429], ["failed", 500]] as const) {
    const { deps, calls } = fake({}, { ok: false, reason });
    const res = await handle(post(good()), deps);
    assertEquals(res.status, status, reason);
    assertEquals(calls.mail.length, 0, reason);
  }
});

Deno.test("a database exception is a clean 500 with no detail", async () => {
  const { deps, calls } = fake({ issue: () => Promise.reject(new Error("secret db detail")) });
  const res = await handle(post(good()), deps);
  assertEquals(res.status, 500);
  assertFalse((await res.text()).includes("secret"));
  assertEquals(calls.mail.length, 0);
});

Deno.test("no address on file, or a failing mail provider, is an error and never leaks the code", async () => {
  const noAddr = fake({ emailOf: () => Promise.resolve(null) });
  assertEquals((await handle(post(good()), noAddr.deps)).status, 500);
  const failing = fake({ sendMail: () => Promise.resolve(false) });
  const res = await handle(post(good()), failing.deps);
  assertEquals(res.status, 502);
  assertFalse((await res.text()).includes("482913"));
  const throwing = fake({ sendMail: () => Promise.reject(new Error("smtp down")) });
  assertEquals((await handle(post(good()), throwing.deps)).status, 502);
});

Deno.test("readClaims accepts a valid token and rejects trailing junk", () => {
  assertEquals(readClaims(good(), NOW.getTime()), { sub: USER, session: SESSION });
  assertEquals(readClaims(good() + "!", NOW.getTime()), null);
});

import { devMailAllowed } from "./handler.ts";

Deno.test("dev-log mode works only for local addresses and only when asked for", () => {
  assertEquals(devMailAllowed("dev-log", "http://kong:8000"), true);
  assertEquals(devMailAllowed("dev-log", "http://127.0.0.1:55321"), true);
  assertEquals(devMailAllowed("dev-log", "http://host.docker.internal:55321"), true);
  for (const url of ["https://xiozwoocisesgmegewww.supabase.co", "https://x.supabase.co.evil.example", "https://localhost.evil.example", "http://kong.evil.example", "", undefined, "not a url"]) {
    assertEquals(devMailAllowed("dev-log", url), false, String(url));
  }
  assertEquals(devMailAllowed(undefined, "http://kong:8000"), false);
  assertEquals(devMailAllowed("", "http://kong:8000"), false);
  assertEquals(devMailAllowed("yes", "http://kong:8000"), false);
});
