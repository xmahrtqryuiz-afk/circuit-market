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

  let body: { store_id?: unknown; listing_id?: unknown; channel?: unknown };
  try { body = await req.json(); } catch { return json({ error: "A valid JSON request is required" }, 400); }
  const storeId = body.store_id;
  const listingId = body.listing_id;
  const channel = body.channel;
  if (!isUuid(storeId) || !isUuid(listingId) || (channel !== "phone" && channel !== "whatsapp")) {
    return json({ error: "A valid store, listing and contact channel are required" }, 400);
  }

  const { data: listing, error: listingError } = await admin
    .from("listings").select("id,seller_store_id,is_active,moderation_status")
    .eq("id", listingId).eq("seller_store_id", storeId).maybeSingle();
  if (listingError || !listing || !listing.is_active || listing.moderation_status !== "approved") {
    return json({ error: "This listing is not currently available for contact" }, 404);
  }

  const { data: store, error: storeError } = await admin
    .from("seller_stores").select("id,owner_id,verification_status")
    .eq("id", storeId).eq("verification_status", "verified").maybeSingle();
  if (storeError || !store) return json({ error: "This seller is not currently contactable" }, 404);
  if (store.owner_id === user.id) return json({ error: "You cannot unlock your own store contact" }, 403);

  const { data: contact, error: contactError } = await admin
    .from("seller_store_contacts").select("contact_phone,whatsapp_number")
    .eq("store_id", storeId).maybeSingle();
  if (contactError || !contact) return json({ error: "Seller contact details are not available yet" }, 404);
  const value = channel === "phone" ? contact.contact_phone : contact.whatsapp_number;
  if (!value) return json({ error: "This seller has not provided that contact method" }, 404);

  const { count, error: rateError } = await admin
    .from("seller_contact_requests").select("id", { count: "exact", head: true })
    .eq("buyer_id", user.id)
    .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
  if (rateError) return json({ error: "Contact request could not be checked" }, 500);
  if ((count ?? 0) >= 40) return json({ error: "Daily contact request limit reached" }, 429);

  const { error: requestError } = await admin.from("seller_contact_requests").insert({
    buyer_id: user.id, store_id: storeId, listing_id: listingId, channel,
  });
  if (requestError) return json({ error: "Contact request could not be recorded" }, 500);

  return json({ channel, contact: value, store_id: storeId, listing_id: listingId });
});