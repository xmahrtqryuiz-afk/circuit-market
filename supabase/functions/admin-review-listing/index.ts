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

  const { data: listing, error: listingError } = await admin.from("listings")
    .select("id,seller_store_id,moderation_status,price_flag_status")
    .eq("id",listingId).maybeSingle();
  if (listingError || !listing) return json({ error: "Listing not found" }, 404);
  const { data: store, error: storeError } = await admin.from("seller_stores")
    .select("owner_id").eq("id",listing.seller_store_id).maybeSingle();
  if (storeError || !store) return json({ error: "Seller store not found" }, 404);
  if (store.owner_id === user.id) return json({ error: "You cannot review your own listing" }, 403);
  if (decision === "approved" && listing.price_flag_status === "review_required" && !overrideFlag) {
    return json({ error: "This listing has a price or duplicate flag. Explicitly review and clear it before approval." }, 409);
  }

  const update: Record<string,unknown> = { moderation_status:decision };
  if (decision === "rejected" || decision === "suspended") update.is_active = false;
  if (decision === "approved" && overrideFlag) {
    update.price_flag_status = "cleared";
    update.price_flag_reason = null;
  }
  const { data: updated, error: updateError } = await admin.from("listings")
    .update(update).eq("id",listingId).select("id,moderation_status,price_flag_status").maybeSingle();
  if (updateError) return json({ error: "Listing moderation could not be saved" }, 500);
  if (!updated) return json({ error: "Listing moderation was not updated" }, 409);

  await admin.from("moderation_events").insert({
    actor_id:user.id,target_type:"listing",target_id:listingId,
    action:decision,reason,metadata:{price_flag_override:overrideFlag},
  });
  await admin.from("audit_logs").insert({
    actor_id:user.id,action:"listing_"+decision,target_type:"listing",target_id:listingId,
    metadata:{price_flag_override:overrideFlag},
  });
  return json({ success:true, listing_id:listingId, moderation_status:updated.moderation_status,
    price_flag_status:updated.price_flag_status });
});