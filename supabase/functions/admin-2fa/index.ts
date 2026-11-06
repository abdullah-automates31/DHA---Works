// Entry point: wires the handler to Supabase (service role, server-side only) and a mail provider.
// Secrets (set with `supabase secrets set`, never committed): ADMIN_MAIL_API_KEY, ADMIN_MAIL_FROM.
// The provider below is Resend's HTTP API; the choice is still open (docs/OPEN-QUESTIONS.md), swap sendMail to change it.
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected by Supabase.
import { createClient } from "@supabase/supabase-js";
import { devMailAllowed, handle, type IssueResult } from "./handler.ts";

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
    async sendMail(to, subject, text) {
      if (devMailAllowed(Deno.env.get("ADMIN_MAIL_MODE"), Deno.env.get("SUPABASE_URL"))) {
        console.log(`[admin-2fa dev] to=${to} ${text.split("\n")[0]}`); // local only, see devMailAllowed
        return true;
      }
      const key = Deno.env.get("ADMIN_MAIL_API_KEY");
      const from = Deno.env.get("ADMIN_MAIL_FROM");
      if (!key || !from) return false; // fail closed: no provider configured, no code goes out
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
        body: JSON.stringify({ from, to: [to], subject, text }),
        signal: AbortSignal.timeout(10_000),
      });
      return res.ok;
    },
  })
);
