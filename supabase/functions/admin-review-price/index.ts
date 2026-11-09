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

  const { data: result, error: reviewError } = await admin.rpc("admin_review_price_atomic", {
    p_actor_id: user.id,
    p_observation_id: observationId,
    p_decision: decision,
    p_review_notes: reviewNotes,
  });
  if (reviewError) {
    const status = reviewError.code === "42501" ? 403 : reviewError.code === "P0002" ? 404
      : reviewError.code === "P0001" ? 409 : reviewError.code === "22023" ? 422 : 500;
    return json({ error: reviewError.message || "The price review could not be saved" }, status);
  }
  return json(result);
});