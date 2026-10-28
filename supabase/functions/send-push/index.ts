// Entry point: wires the handler to Supabase (service role, server-side only) and the Expo push service.
// Required secrets (set with `supabase secrets set`, never committed): PUSH_DISPATCH_SECRET.
// Optional: EXPO_ACCESS_TOKEN (enhanced push security), EXPO_PUSH_URL (tests only).
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected by Supabase.

import { createClient } from "@supabase/supabase-js";
import {
  handle,
  type NotificationRow,
  type Store,
  type TokenRow,
} from "./handler.ts";

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  {
    auth: { persistSession: false, autoRefreshToken: false },
  },
);

const store: Store = {
  async listUnsent(limit, sinceIso) {
    const { data, error } = await db.from("notifications")
      .select("id, user_id, type, job_id, payload")
      .is("push_sent_at", null)
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: true })
      .limit(limit);
    if (error) throw new Error("list failed");
    return (data ?? []) as NotificationRow[];
  },
  async claim(id) {
    const { data, error } = await db.from("notifications")
      .update({ push_sent_at: new Date().toISOString() })
      .eq("id", id)
      .is("push_sent_at", null)
      .select("id");
    if (error) throw new Error("claim failed");
    return (data?.length ?? 0) === 1;
  },
  async release(ids) {
    if (ids.length === 0) return;
    const { error } = await db.from("notifications").update({
      push_sent_at: null,
    }).in("id", ids);
    if (error) throw new Error("release failed");
  },
  async tokensFor(userIds) {
    const { data, error } = await db.from("device_tokens")
      .select("user_id, push_token, profiles!inner(account_status)")
      .in("user_id", userIds)
      .eq("profiles.account_status", "active");
    if (error) throw new Error("token lookup failed");
    return (data ?? []).map((r: TokenRow) => ({
      user_id: r.user_id,
      push_token: r.push_token,
    }));
  },
  async deleteTokens(tokens) {
    if (tokens.length === 0) return;
    const { error } = await db.from("device_tokens").delete().in(
      "push_token",
      tokens,
    );
    if (error) throw new Error("token delete failed");
  },
};

Deno.serve((req) =>
  handle(req, {
    store,
    fetch,
    secret: Deno.env.get("PUSH_DISPATCH_SECRET"),
    expoUrl: Deno.env.get("EXPO_PUSH_URL") ??
      "https://exp.host/--/api/v2/push/send",
    expoAccessToken: Deno.env.get("EXPO_ACCESS_TOKEN") || undefined,
    now: () => new Date(),
  })
);
