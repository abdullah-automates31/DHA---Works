// Pure helpers for the push dispatcher. No network, no database: easy to test.

export const EXPO_TOKEN_RE = /^Expo(nent)?PushToken\[[A-Za-z0-9_-]{10,}\]$/;
export const MAX_BATCH = 100; // Expo accepts at most 100 messages per request
export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 100;
export const MAX_BODY_BYTES = 1024;

export function isValidExpoToken(token: unknown): token is string {
  return typeof token === "string" && token.length <= 200 &&
    EXPO_TOKEN_RE.test(token);
}

// Constant-time comparison so the shared secret cannot be guessed byte by byte.
export function timingSafeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  let diff = ea.length ^ eb.length;
  const n = Math.max(ea.length, eb.length);
  for (let i = 0; i < n; i++) diff |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
  return diff === 0;
}

export type ParsedRequest = { ok: true; limit: number } | {
  ok: false;
  error: string;
};

// The only accepted input is {"limit": 1..100}. Recipients are never part of the request: they come
// from notifications.user_id in the database. Any other key is rejected, including user_id / to.
export function parseRequest(raw: string): ParsedRequest {
  if (raw.trim() === "") return { ok: true, limit: DEFAULT_LIMIT };
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return { ok: false, error: "body must be valid JSON" };
  }
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "body must be a JSON object" };
  }
  const keys = Object.keys(body);
  if (keys.some((k) => k !== "limit")) {
    return { ok: false, error: "only 'limit' is accepted" };
  }
  const limit = (body as { limit?: unknown }).limit;
  if (limit === undefined) return { ok: true, limit: DEFAULT_LIMIT };
  if (
    typeof limit !== "number" || !Number.isInteger(limit) || limit < 1 ||
    limit > MAX_LIMIT
  ) {
    return {
      ok: false,
      error: `limit must be an integer from 1 to ${MAX_LIMIT}`,
    };
  }
  return { ok: true, limit };
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

// Only the job title is ever used from the payload, cleaned and shortened. Phone numbers, plot numbers,
// amounts and names never go into a push (it is shown on a locked screen and passes through Expo and Google).
export function safeTitle(payload: unknown): string | null {
  const t = (payload as { title?: unknown } | null)?.title;
  if (typeof t !== "string") return null;
  // deno-lint-ignore no-control-regex
  const cleaned = t.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return null;
  return cleaned.length > 60 ? cleaned.slice(0, 57) + "..." : cleaned;
}

type Copy = { title: string; body: (job: string | null) => string };
const forJob = (
  job: string | null,
  fallback: string,
) => (job ? `"${job}"` : fallback);

const COPY: Record<string, Copy> = {
  new_interest: {
    title: "New interest",
    body: (j) => `A worker is interested in ${forJob(j, "your job")}.`,
  },
  quote_received: {
    title: "New quote",
    body: (j) => `You received a quote for ${forJob(j, "your job")}.`,
  },
  quote_accepted: {
    title: "Quote accepted",
    body: (j) => `Your quote for ${forJob(j, "the job")} was accepted.`,
  },
  quote_not_selected: {
    title: "Not selected",
    body: (j) => `${forJob(j, "A job")} went to another worker.`,
  },
  quote_rejected: {
    title: "Quote declined",
    body: (j) => `Your quote for ${forJob(j, "a job")} was declined.`,
  },
  job_started: {
    title: "Work started",
    body: (j) => `Work has started on ${forJob(j, "your job")}.`,
  },
  job_completed: {
    title: "Work finished",
    body: (j) => `${forJob(j, "Your job")} was marked completed.`,
  },
  cash_awaiting_you: {
    title: "Cash entry needed",
    body: (j) => `Please enter the cash amount for ${forJob(j, "your job")}.`,
  },
  cash_collected: {
    title: "Cash recorded",
    body: (j) => `Cash was recorded for ${forJob(j, "your job")}.`,
  },
  rate_worker: {
    title: "Rate your worker",
    body: (j) => `How did ${forJob(j, "the job")} go? Leave a rating.`,
  },
  job_expiring: {
    title: "Job expiring soon",
    body: (j) => `${forJob(j, "Your job")} will expire soon.`,
  },
  job_expired: {
    title: "Job expired",
    body: (j) => `${forJob(j, "A job")} has expired.`,
  },
  job_cancelled: {
    title: "Job cancelled",
    body: (j) => `${forJob(j, "A job")} was cancelled.`,
  },
  cancellation_requested: {
    title: "Cancellation requested",
    body: (j) => `A cancellation was requested for ${forJob(j, "a job")}.`,
  },
  job_stuck: {
    title: "Job needs attention",
    body: (j) => `${forJob(j, "A job")} needs attention.`,
  },
  verification_submitted: {
    title: "Application submitted",
    body: () => "A new application is waiting for review.",
  },
  poor_work_report: {
    title: "Report filed",
    body: () => "A low rating created a report for review.",
  },
  unsafe_report: {
    title: "Unsafe report",
    body: () => "An unsafe-situation report needs review.",
  },
  report_received: {
    title: "Report received",
    body: () => "A new report needs review.",
  },
};

export function buildMessage(
  type: string,
  payload: unknown,
): { title: string; body: string } {
  const copy = COPY[type];
  if (!copy) {
    return { title: "DHA Works", body: "You have a new notification." };
  }
  return { title: copy.title, body: copy.body(safeTitle(payload)) };
}

export type ExpoTicket = { status?: string; details?: { error?: string } };

// Expo returns one ticket per message, in order. DeviceNotRegistered means the token is dead for good.
export function deadTokens(tokens: string[], tickets: ExpoTicket[]): string[] {
  const dead: string[] = [];
  tickets.forEach((t, i) => {
    if (
      t?.status === "error" && t.details?.error === "DeviceNotRegistered" &&
      tokens[i]
    ) dead.push(tokens[i]);
  });
  return dead;
}
