// Entry point: wires the handler to Supabase (service role, server-side only) and Brevo for the email.
// Secrets (set with `supabase secrets set`, never committed): ADMIN_MAIL_API_KEY (Brevo v3 API key),
// ADMIN_MAIL_FROM (a sender verified in Brevo). Local only: ADMIN_MAIL_MODE=dev-log (see devMailAllowed).
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected by Supabase.
import { createClient } from "@supabase/supabase-js";
import { devMailAllowed, handle, type IssueResult } from "./handler.ts";
import { sendViaBrevo } from "./mail.ts";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

Deno.serve((req) =>
  handle(req, {
    now: () => new Date(),
    async issue(userId, sessionId): Promise<IssueResult> {
      const { data, error } = await db.rpc("admin_issue_challenge", { p_user: userId, p_session: sessionId });
      if (!error && typeof data === "string") return { ok: true, code: data };
      if (error?.code === "42501") return { ok: false, reason: "forbidden" };
      if (error?.message?.startsWith("wait a minute")) return { ok: false, reason: "too_soon" };
      if (error?.message?.startsWith("too many codes")) return { ok: false, reason: "too_many" };
      return { ok: false, reason: "failed" };
    },
    async emailOf(userId) {
      const { data, error } = await db.auth.admin.getUserById(userId);
      return error ? null : (data.user?.email ?? null);
    },
    sendMail(to, subject, text) {
      if (devMailAllowed(Deno.env.get("ADMIN_MAIL_MODE"), Deno.env.get("SUPABASE_URL"))) {
        console.log(`[admin-2fa dev] to=${to} ${text.split("\n")[0]}`); // local only, see devMailAllowed
        return Promise.resolve(true);
      }
      return sendViaBrevo(
        { fetch, apiKey: Deno.env.get("ADMIN_MAIL_API_KEY"), from: Deno.env.get("ADMIN_MAIL_FROM") },
        to,
        subject,
        text,
      );
    },
  })
);
