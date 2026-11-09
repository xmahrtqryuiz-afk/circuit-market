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
async function clients(req: Request) {
  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return { error: json({ error: "Sign in is required" }, 401) };
  const url = Deno.env.get("SUPABASE_URL");
  const publishableRaw = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS");
  const secretRaw = Deno.env.get("SUPABASE_SECRET_KEYS");
  const publishableKey = publishableRaw ? JSON.parse(publishableRaw).default : Deno.env.get("SUPABASE_ANON_KEY");
  const secretKey = secretRaw ? JSON.parse(secretRaw).default : Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !publishableKey || !secretKey) return { error: json({ error: "Server configuration is incomplete" }, 500) };
  const userClient = createClient(url, publishableKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const admin = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await userClient.auth.getUser();
  if (error || !data.user) return { error: json({ error: "Your session could not be verified" }, 401) };
  return { user: data.user, admin };
}
async function hasRole(admin: any, userId: string, rolesAllowed: string[]) {
  const { data, error } = await admin.from("admin_user_roles").select("role").eq("user_id", userId);
  if (error) return { error: true, allowed: false };
  return { error: false, allowed: (data ?? []).some((x: {role:string}) => rolesAllowed.includes(x.role)) };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const ctx = await clients(req);
  if (ctx.error) return ctx.error;
  const { user, admin } = ctx as any;
  const permission = await hasRole(admin,user.id,["super_admin","moderator"]);
  if (permission.error) return json({ error: "Administrator permissions could not be checked" }, 500);
  if (!permission.allowed) return json({ error: "You are not authorised to review listings" }, 403);

  let body: { listing_id?: unknown; decision?: unknown; override_price_flag?: unknown; reason?: unknown };
  try { body = await req.json(); } catch { return json({ error: "A valid JSON request is required" }, 400); }
  if (!isUuid(body.listing_id) || !["approved","rejected","suspended"].includes(String(body.decision))) {
    return json({ error: "A valid listing and decision are required" }, 400);
  }
  const listingId = body.listing_id;
  const decision = String(body.decision);
  const overrideFlag = body.override_price_flag === true;
  const reason = typeof body.reason === "string" ? body.reason.slice(0,1000) : null;

  const { data: result, error: reviewError } = await admin.rpc("admin_review_listing_atomic", {
    p_actor_id: user.id,
    p_listing_id: listingId,
    p_decision: decision,
    p_override_price_flag: overrideFlag,
    p_reason: reason,
  });
  if (reviewError) {
    const status = reviewError.code === "42501" ? 403 : reviewError.code === "P0002" ? 404
      : reviewError.code === "P0001" ? 409 : reviewError.code === "22023" ? 422 : 500;
    return json({ error: reviewError.message || "Listing moderation could not be saved" }, status);
  }
  return json(result);
});