import {
  assert,
  assertEquals,
  assertFalse,
  assertStringIncludes,
} from "@std/assert";
import {
  type Deps,
  handle,
  type NotificationRow,
  type Store,
  type TokenRow,
} from "./handler.ts";
import {
  buildMessage,
  isValidExpoToken,
  parseRequest,
  safeTitle,
  timingSafeEqual,
} from "./lib.ts";

const SECRET = "test-secret-value";
const TOK_A = "ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]";
const TOK_A2 = "ExponentPushToken[a2a2a2a2a2a2a2a2a2a2a2]";
const TOK_B = "ExponentPushToken[bbbbbbbbbbbbbbbbbbbbbb]";

function fakeStore(
  rows: NotificationRow[],
  tokens: TokenRow[],
  opts: { claimable?: (id: string) => boolean } = {},
) {
  const calls = {
    listed: 0,
    claimed: [] as string[],
    released: [] as string[],
    deleted: [] as string[],
    since: "",
  };
  const store: Store = {
    listUnsent: (_l, since) => {
      calls.listed++;
      calls.since = since;
      return Promise.resolve(rows);
    },
    claim: (id) => {
      const ok = opts.claimable ? opts.claimable(id) : true;
      if (ok) calls.claimed.push(id);
      return Promise.resolve(ok);
    },
    release: (ids) => {
      calls.released.push(...ids);
      return Promise.resolve();
    },
    tokensFor: (userIds) =>
      Promise.resolve(tokens.filter((t) => userIds.includes(t.user_id))),
    deleteTokens: (t) => {
      calls.deleted.push(...t);
      return Promise.resolve();
    },
  };
  return { store, calls };
}

function fakeExpo(
  respond: (messages: { to: string }[]) => Response | Promise<Response> = (m) =>
    Response.json({ data: m.map(() => ({ status: "ok" })) }),
) {
  const sent: Record<string, unknown>[][] = [];
  const f = ((_url: string | URL | Request, init?: RequestInit) => {
    const msgs = JSON.parse(String(init?.body));
    sent.push(msgs);
    return Promise.resolve(respond(msgs));
  }) as typeof fetch;
  return { f, sent };
}

function deps(over: Partial<Deps> & { store: Store }): Deps {
  return {
    fetch: fakeExpo().f,
    secret: SECRET,
    expoUrl: "http://expo.test/push",
    now: () => new Date("2026-10-29T12:00:00Z"),
    ...over,
  };
}

const req = (
  body: string | undefined,
  headers: Record<string, string> = { "x-push-secret": SECRET },
  method = "POST",
) => new Request("http://fn.test/send-push", { method, headers, body });

const row = (
  id: string,
  user: string,
  type = "quote_received",
  payload: unknown = { title: "Kitchen tap" },
): NotificationRow => ({
  id,
  user_id: user,
  type,
  job_id: "job-1",
  payload,
});

// ------------------------------------------------------------------ authorization
Deno.test("rejects a request with no secret and touches nothing", async () => {
  const { store, calls } = fakeStore([row("n1", "A")], [{
    user_id: "A",
    push_token: TOK_A,
  }]);
  const res = await handle(req("{}", {}), deps({ store }));
  assertEquals(res.status, 401);
  assertEquals(calls.listed, 0);
});

Deno.test("rejects a wrong secret, a bearer token and a user JWT in place of the secret", async () => {
  const { store, calls } = fakeStore([row("n1", "A")], [{
    user_id: "A",
    push_token: TOK_A,
  }]);
  const attempts: Record<string, string>[] = [
    { "x-push-secret": "nope" },
    { authorization: "Bearer eyJhbGciOi.fake.jwt" },
    { "x-push-secret": SECRET + "x" },
  ];
  for (const headers of attempts) {
    assertEquals(
      (await handle(req("{}", headers), deps({ store }))).status,
      401,
    );
  }
  assertEquals(calls.listed, 0);
});

Deno.test("fails closed when the secret is not configured, even if the caller sends an empty one", async () => {
  const { store, calls } = fakeStore([row("n1", "A")], []);
  const res = await handle(
    req("{}", { "x-push-secret": "" }),
    deps({ store, secret: undefined }),
  );
  assertEquals(res.status, 500);
  assertEquals(calls.listed, 0);
});

Deno.test("only POST is allowed", async () => {
  const { store } = fakeStore([], []);
  assertEquals(
    (await handle(
      req(undefined, { "x-push-secret": SECRET }, "GET"),
      deps({ store }),
    )).status,
    405,
  );
});

// ------------------------------------------------------------------ input validation
Deno.test("rejects malformed input", async () => {
  const { store, calls } = fakeStore([row("n1", "A")], [{
    user_id: "A",
    push_token: TOK_A,
  }]);
  const bad = [
    "not json",
    "[]",
    "null",
    '"x"',
    '{"limit":0}',
    '{"limit":101}',
    '{"limit":1.5}',
    '{"limit":"5"}',
    '{"limit":-3}',
  ];
  for (const body of bad) {
    assertEquals((await handle(req(body), deps({ store }))).status, 400, body);
  }
  assertEquals(calls.listed, 0);
});

Deno.test("a caller cannot name recipients or tokens", async () => {
  const { store, calls } = fakeStore([row("n1", "A")], [{
    user_id: "A",
    push_token: TOK_A,
  }]);
  const bodies = [
    '{"user_id":"B"}',
    '{"user_ids":["B"]}',
    '{"to":"ExponentPushToken[cccccccccccccccccccccc]"}',
    '{"limit":5,"tokens":["x"]}',
    '{"notification":{"user_id":"B","title":"hi"}}',
  ];
  for (const b of bodies) {
    assertEquals((await handle(req(b), deps({ store }))).status, 400, b);
  }
  assertEquals(calls.listed, 0);
});

Deno.test("an oversized body is refused", async () => {
  const { store } = fakeStore([], []);
  const res = await handle(
    req(JSON.stringify({ limit: 5, pad: "x".repeat(5000) })),
    deps({ store }),
  );
  assertEquals(res.status, 413);
});

Deno.test("an empty body uses the default limit", () => {
  assertEquals(parseRequest(""), { ok: true, limit: 50 });
  assertEquals(parseRequest("{}"), { ok: true, limit: 50 });
  assertEquals(parseRequest('{"limit":100}'), { ok: true, limit: 100 });
});

// ------------------------------------------------------------------ recipients come from the database
Deno.test("each notification goes only to its owner's tokens", async () => {
  const { store, calls } = fakeStore(
    [row("n1", "A"), row("n2", "B", "quote_accepted")],
    [
      { user_id: "A", push_token: TOK_A },
      { user_id: "A", push_token: TOK_A2 },
      { user_id: "B", push_token: TOK_B },
    ],
  );
  const expo = fakeExpo();
  const res = await handle(req("{}"), deps({ store, fetch: expo.f }));
  assertEquals(res.status, 200);
  const msgs = expo.sent.flat() as {
    to: string;
    data: { notificationId: string };
  }[];
  assertEquals(msgs.length, 3);
  for (const m of msgs) {
    const owner = m.data.notificationId === "n1" ? [TOK_A, TOK_A2] : [TOK_B];
    assert(
      owner.includes(m.to),
      "a message reached a token that does not belong to the notification owner",
    );
  }
  assertEquals(calls.claimed.sort(), ["n1", "n2"]);
  assertEquals(await res.json(), {
    processed: 2,
    sent: 3,
    failed: 0,
    removed_tokens: 0,
  });
});

Deno.test("a user with no devices is processed without calling Expo", async () => {
  const { store } = fakeStore([row("n1", "A")], []);
  const expo = fakeExpo();
  const res = await handle(req("{}"), deps({ store, fetch: expo.f }));
  assertEquals((await res.json()).processed, 1);
  assertEquals(expo.sent.length, 0);
});

Deno.test("a row already claimed by another run is not sent twice", async () => {
  const { store } = fakeStore([row("n1", "A")], [{
    user_id: "A",
    push_token: TOK_A,
  }], { claimable: () => false });
  const expo = fakeExpo();
  const res = await handle(req("{}"), deps({ store, fetch: expo.f }));
  assertEquals((await res.json()).processed, 0);
  assertEquals(expo.sent.length, 0);
});

Deno.test("only recent notifications are fetched (24 hours)", async () => {
  const { store, calls } = fakeStore([], []);
  await handle(req("{}"), deps({ store }));
  assertEquals(calls.since, "2026-10-28T12:00:00.000Z");
});

// ------------------------------------------------------------------ tokens
Deno.test("junk tokens are never forwarded to Expo", async () => {
  const { store } = fakeStore([row("n1", "A")], [
    { user_id: "A", push_token: "not-a-token" },
    { user_id: "A", push_token: "ExponentPushToken[short]" },
    { user_id: "A", push_token: TOK_A },
  ]);
  const expo = fakeExpo();
  await handle(req("{}"), deps({ store, fetch: expo.f }));
  assertEquals((expo.sent.flat() as { to: string }[]).map((m) => m.to), [
    TOK_A,
  ]);
  assert(isValidExpoToken(TOK_A));
  assertFalse(isValidExpoToken("ExponentPushToken[x]; drop table"));
  assertFalse(isValidExpoToken(12345));
});

Deno.test("expired tokens (DeviceNotRegistered) are deleted, other errors are not", async () => {
  const { store, calls } = fakeStore([row("n1", "A")], [{
    user_id: "A",
    push_token: TOK_A,
  }, { user_id: "A", push_token: TOK_A2 }]);
  const expo = fakeExpo(() =>
    Response.json({
      data: [
        {
          status: "error",
          message: "gone",
          details: { error: "DeviceNotRegistered" },
        },
        {
          status: "error",
          message: "slow down",
          details: { error: "MessageRateExceeded" },
        },
      ],
    })
  );
  const res = await handle(req("{}"), deps({ store, fetch: expo.f }));
  assertEquals(calls.deleted, [TOK_A]);
  assertEquals(await res.json(), {
    processed: 1,
    sent: 0,
    failed: 2,
    removed_tokens: 1,
  });
});

// ------------------------------------------------------------------ failure handling
Deno.test("an Expo outage releases the rows so the next run retries", async () => {
  const { store, calls } = fakeStore([row("n1", "A")], [{
    user_id: "A",
    push_token: TOK_A,
  }]);
  const expo = fakeExpo(() => new Response("bad gateway", { status: 502 }));
  const res = await handle(req("{}"), deps({ store, fetch: expo.f }));
  assertEquals(res.status, 200);
  assertEquals(calls.released, ["n1"]);
});

Deno.test("a network failure releases the rows too", async () => {
  const { store, calls } = fakeStore([row("n1", "A")], [{
    user_id: "A",
    push_token: TOK_A,
  }]);
  const res = await handle(
    req("{}"),
    deps({
      store,
      fetch: (() => Promise.reject(new Error("offline"))) as typeof fetch,
    }),
  );
  assertEquals(res.status, 200);
  assertEquals(calls.released, ["n1"]);
});

Deno.test("a 400 from Expo is not retried forever", async () => {
  const { store, calls } = fakeStore([row("n1", "A")], [{
    user_id: "A",
    push_token: TOK_A,
  }]);
  const expo = fakeExpo(() => new Response("bad request", { status: 400 }));
  await handle(req("{}"), deps({ store, fetch: expo.f }));
  assertEquals(calls.released, []);
});

Deno.test("a database error gives a generic 500 with no internal detail", async () => {
  const { store } = fakeStore([], []);
  store.listUnsent = () =>
    Promise.reject(new Error("connection string postgres://user:hunter2@db"));
  const res = await handle(req("{}"), deps({ store }));
  assertEquals(res.status, 500);
  const text = await res.text();
  assertEquals(text, '{"error":"internal error"}');
  assertFalse(text.includes("hunter2"));
});

Deno.test("batches are capped at 100 messages", async () => {
  const rows = Array.from({ length: 3 }, (_, i) => row(`n${i}`, "A"));
  const tokens = Array.from({ length: 70 }, (_, i) => ({
    user_id: "A",
    push_token: `ExponentPushToken[${String(i).padStart(22, "t")}]`,
  }));
  const { store } = fakeStore(rows, tokens);
  const expo = fakeExpo();
  await handle(req("{}"), deps({ store, fetch: expo.f }));
  assertEquals(expo.sent.map((b) => b.length), [100, 100, 10]);
});

// ------------------------------------------------------------------ message content (privacy)
Deno.test("push text uses only the job title; phone, plot and amounts are never included", async () => {
  const payload = {
    title: "Fix tap",
    phone: "03001234567",
    plot_no: "12-C",
    amount: 4500,
    worker_name: "Usman",
  };
  const { store } = fakeStore([row("n1", "A", "quote_accepted", payload)], [{
    user_id: "A",
    push_token: TOK_A,
  }]);
  const expo = fakeExpo();
  await handle(req("{}"), deps({ store, fetch: expo.f }));
  const sentText = JSON.stringify(expo.sent);
  for (const secret of ["03001234567", "12-C", "4500", "Usman"]) {
    assertFalse(sentText.includes(secret), secret);
  }
  assertStringIncludes(sentText, "Fix tap");
});

Deno.test("titles are cleaned and shortened; unknown types get a generic message", () => {
  assertEquals(safeTitle({ title: "  a\nb\u0000c  " }), "a b c");
  assertEquals(safeTitle({ title: "x".repeat(100) })?.length, 60);
  assertEquals(safeTitle({ title: 42 }), null);
  assertEquals(safeTitle(null), null);
  assertEquals(buildMessage("something_new", { title: "secret job" }), {
    title: "DHA Works",
    body: "You have a new notification.",
  });
  assertEquals(
    buildMessage("quote_received", {}).body,
    "You received a quote for your job.",
  );
});

Deno.test("secret comparison is exact", () => {
  assert(timingSafeEqual("abc", "abc"));
  assertFalse(timingSafeEqual("abc", "abd"));
  assertFalse(timingSafeEqual("abc", "abcd"));
  assertFalse(timingSafeEqual("", "a"));
});

Deno.test("responses never contain tokens or user ids", async () => {
  const { store } = fakeStore([row("n1", "user-uuid-1")], [{
    user_id: "user-uuid-1",
    push_token: TOK_A,
  }]);
  const res = await handle(req("{}"), deps({ store }));
  const text = await res.text();
  assertFalse(text.includes(TOK_A));
  assertFalse(text.includes("user-uuid-1"));
});
