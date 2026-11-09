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
  const permission = await hasRole(admin, user.id, ["super_admin","moderator"]);
  if (permission.error) return json({ error: "Administrator permissions could not be checked" }, 500);
  if (!permission.allowed) return json({ error: "You are not authorised to review sellers" }, 403);

  let body: { store_id?: unknown; decision?: unknown; review_notes?: unknown };
  try { body = await req.json(); } catch { return json({ error: "A valid JSON request is required" }, 400); }
  if (!isUuid(body.store_id) || !["approve_business","reject","suspend"].includes(String(body.decision))) {
    return json({ error: "A valid store and decision are required" }, 400);
  }
  const storeId = body.store_id;
  const decision = String(body.decision);
  const notes = typeof body.review_notes === "string" ? body.review_notes.slice(0,1000) : null;

  const { data: store, error: storeError } = await admin.from("seller_stores")
    .select("id,owner_id,verification_status,verification_level").eq("id",storeId).maybeSingle();
  if (storeError || !store) return json({ error: "Store not found" }, 404);
  if (store.owner_id === user.id) return json({ error: "You cannot review your own store" }, 403);

  let nextStatus = "verified";
  let nextLevel = "business_verified";
  if (decision === "reject") { nextStatus = "rejected"; nextLevel = "unverified"; }
  if (decision === "suspend") { nextStatus = "suspended"; nextLevel = store.verification_level; }

  let verificationRecordId: string | null = null;
  if (decision === "approve_business") {
    const { data: record, error: recordError } = await admin.from("seller_verification_records")
      .select("id,evidence_storage_path,evidence_mime_type")
      .eq("store_id",storeId).eq("verification_type","business")
      .eq("verification_status","pending").not("evidence_storage_path","is",null)
      .order("created_at",{ascending:false}).limit(1).maybeSingle();
    if (recordError) return json({ error: "Verification evidence could not be checked" }, 500);
    if (!record) return json({ error: "Business verification requires a submitted evidence document" }, 409);
    verificationRecordId = record.id;
  }

  const reviewedAt = new Date().toISOString();
  const { data: updated, error: updateError } = await admin.from("seller_stores")
    .update({
      verification_status: nextStatus,
      verification_level: nextLevel,
      verification_reviewed_at: reviewedAt,
      verification_reviewed_by: user.id,
    }).eq("id",storeId).select("id,verification_status,verification_level").maybeSingle();
  if (updateError) return json({ error: "Seller verification could not be saved" }, 500);
  if (!updated) return json({ error: "Seller verification was not updated" }, 409);

  if (verificationRecordId) {
    await admin.from("seller_verification_records").update({
      verification_status:"approved", reviewer_id:user.id, reviewed_at:reviewedAt,
    }).eq("id",verificationRecordId);
  }
  await admin.from("moderation_events").insert({
    actor_id:user.id,target_type:"store",target_id:storeId,
    action:decision,reason:notes,
  });
  await admin.from("audit_logs").insert({
    actor_id:user.id,action:"seller_store_"+decision,target_type:"store",target_id:storeId,
    metadata:{verification_level:nextLevel},
  });
  return json({ success:true, store_id:storeId, verification_status:updated.verification_status,
    verification_level:updated.verification_level });
});