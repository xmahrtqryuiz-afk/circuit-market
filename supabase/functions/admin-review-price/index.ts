import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: corsHeaders });
}
function isUuid(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return json({ error: "Sign in is required" }, 401);

  const url = Deno.env.get("SUPABASE_URL");
  const publishableRaw = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS");
  const secretRaw = Deno.env.get("SUPABASE_SECRET_KEYS");
  const publishableKey = publishableRaw ? JSON.parse(publishableRaw).default : Deno.env.get("SUPABASE_ANON_KEY");
  const secretKey = secretRaw ? JSON.parse(secretRaw).default : Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !publishableKey || !secretKey) return json({ error: "Server configuration is incomplete" }, 500);

  const userClient = createClient(url, publishableKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const admin = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  const user = userData.user;
  if (userError || !user) return json({ error: "Your session could not be verified" }, 401);

  const { data: roles, error: roleError } = await admin
    .from("admin_user_roles").select("role").eq("user_id", user.id);
  if (roleError) return json({ error: "Administrator permissions could not be checked" }, 500);
  const roleSet = new Set((roles ?? []).map((r: { role: string }) => r.role));
  if (!["super_admin", "price_reviewer", "moderator"].some((r) => roleSet.has(r))) {
    return json({ error: "You are not authorised to review price evidence" }, 403);
  }

  let body: { observation_id?: unknown; decision?: unknown; review_notes?: unknown };
  try { body = await req.json(); } catch { return json({ error: "A valid JSON request is required" }, 400); }
  const observationId = body.observation_id;
  const decision = body.decision;
  const reviewNotes = typeof body.review_notes === "string" ? body.review_notes.slice(0, 1000) : null;
  if (!isUuid(observationId) || (decision !== "approved" && decision !== "rejected")) {
    return json({ error: "A valid observation and review decision are required" }, 400);
  }

  const { data: observation, error: observationError } = await admin
    .from("price_observations").select("id,product_id,submitted_by,review_status")
    .eq("id", observationId).maybeSingle();
  if (observationError || !observation) return json({ error: "Price observation not found" }, 404);
  if (observation.submitted_by === user.id) return json({ error: "You cannot review your own price submission" }, 403);
  if (observation.review_status !== "pending") return json({ error: "This price observation has already been reviewed" }, 409);

  const reviewedAt = new Date().toISOString();
  const { data: updated, error: updateError } = await admin
    .from("price_observations")
    .update({ review_status: decision, reviewed_by: user.id, reviewed_at: reviewedAt, review_notes: reviewNotes })
    .eq("id", observationId).eq("review_status", "pending")
    .select("id,review_status").maybeSingle();

  if (updateError) return json({ error: "The price review could not be saved" }, 500);
  if (!updated) return json({ error: "This price observation was reviewed by someone else" }, 409);

  const [eventResult, auditResult] = await Promise.all([
    admin.from("moderation_events").insert({
      actor_id: user.id, target_type: "price_observation", target_id: observationId,
      action: decision, reason: reviewNotes,
    }),
    admin.from("audit_logs").insert({
      actor_id: user.id, action: "price_observation_" + decision,
      target_type: "price_observation", target_id: observationId,
      metadata: { product_id: observation.product_id },
    }),
  ]);
  if (eventResult.error || auditResult.error) {
    return json({ success: true, observation_id: observationId, review_status: decision,
      audit_warning: "Review saved; an audit event could not be recorded" }, 200);
  }
  return json({ success: true, observation_id: observationId, review_status: decision });
});