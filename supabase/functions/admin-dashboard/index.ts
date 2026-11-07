import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Content-Type": "application/json",
};
function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: corsHeaders });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);
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

  const { data: roleRows, error: roleError } = await admin.from("admin_user_roles").select("role").eq("user_id", user.id);
  if (roleError) return json({ error: "Administrator permissions could not be checked" }, 500);
  const roles = [...new Set((roleRows ?? []).map((row: { role: string }) => row.role))];
  if (!roles.length) return json({ error: "You are not authorised to access moderation queues" }, 403);

  const canModerate = roles.some((role) => ["super_admin", "moderator"].includes(role));
  const canReviewPrices = roles.some((role) => ["super_admin", "price_reviewer", "moderator"].includes(role));
  const canManageCatalogue = roles.some((role) => ["super_admin", "catalog_manager"].includes(role));
  const canManageReports = roles.some((role) => ["super_admin", "moderator", "support"].includes(role));
  const canReviewCompatibility = roles.some((role) => ["super_admin", "catalog_manager"].includes(role));

  const [storesResult, listingsResult, pricesResult, requestsResult, reportsResult, compatibilityResult] = await Promise.all([
    canModerate ? admin.from("seller_stores").select("id,store_name,description,city,area,verification_status,verification_level,created_at").eq("verification_status", "pending").order("created_at").limit(50) : Promise.resolve({ data: [], error: null }),
    canModerate ? admin.from("listings").select("id,product_id,seller_store_id,variant_label,item_condition,asking_price,quantity,city,area,notes,moderation_status,price_flag_status,price_flag_reason,created_at").in("moderation_status", ["pending", "review_required"]).order("created_at").limit(50) : Promise.resolve({ data: [], error: null }),
    canReviewPrices ? admin.from("price_observations").select("id,product_id,submitted_by,variant_label,item_condition,amount_value,city,area,source_type,source_description,evidence_url,observed_on,review_status,is_duplicate,is_price_outlier,created_at").eq("review_status", "pending").order("created_at").limit(50) : Promise.resolve({ data: [], error: null }),
    canManageCatalogue ? admin.from("product_requests").select("id,requested_by,requested_name,brand,model,product_type,category_id,compatibility_notes,request_status,created_at").eq("request_status", "pending").order("created_at").limit(50) : Promise.resolve({ data: [], error: null }),
  ]);
  for (const result of [storesResult, listingsResult, pricesResult, requestsResult]) {
    if (result.error) return json({ error: "A moderation queue could not be loaded" }, 500);
  }

  const listings = listingsResult.data ?? [];
  const prices = pricesResult.data ?? [];
  const requests = requestsResult.data ?? [];
  const compatibilities = compatibilityResult.data ?? [];
  const productIds = [...new Set([...listings.map((x: any) => x.product_id), ...prices.map((x: any) => x.product_id), ...compatibilities.flatMap((x: any) => [x.part_product_id, x.compatible_product_id])])];
  const storeIds = [...new Set(listings.map((x: any) => x.seller_store_id))];
  const categoryIds = [...new Set(requests.map((x: any) => x.category_id).filter(Boolean))];
  const [productsResult, storeNamesResult, categoriesResult, verificationEvidenceResult, priceEvidenceResult] = await Promise.all([
    productIds.length ? admin.from("products").select("id,name,brand,model").in("id", productIds) : Promise.resolve({ data: [], error: null }),
    storeIds.length ? admin.from("seller_stores").select("id,store_name").in("id", storeIds) : Promise.resolve({ data: [], error: null }),
    categoryIds.length ? admin.from("categories").select("id,name").in("id", categoryIds) : Promise.resolve({ data: [], error: null }),
    (storesResult.data ?? []).length ? admin.from("seller_verification_records").select("id,store_id,verification_type,evidence_storage_path,evidence_mime_type,created_at").in("store_id", (storesResult.data ?? []).map((x: any) => x.id)).eq("verification_type", "business").eq("verification_status", "pending").not("evidence_storage_path", "is", null).order("created_at", { ascending: false }) : Promise.resolve({ data: [], error: null }),
    prices.length ? admin.from("price_observation_evidence").select("id,observation_id,storage_path,mime_type,created_at").in("observation_id", prices.map((x: any) => x.id)).order("created_at", { ascending: false }) : Promise.resolve({ data: [], error: null }),
  ]);
  if (productsResult.error || storeNamesResult.error || categoriesResult.error || verificationEvidenceResult.error || priceEvidenceResult.error) return json({ error: "Moderation queue details could not be loaded" }, 500);

  const productNames = new Map((productsResult.data ?? []).map((x: any) => [x.id, [x.brand, x.name, x.model].filter(Boolean).join(" ")]));
  const storeNames = new Map((storeNamesResult.data ?? []).map((x: any) => [x.id, x.store_name]));
  const categoryNames = new Map((categoriesResult.data ?? []).map((x: any) => [x.id, x.name]));
  const evidenceByObservation = new Map<string, any[]>();
  for (const record of (priceEvidenceResult.data ?? []) as any[]) {
    const signed = await admin.storage.from("price-evidence").createSignedUrl(record.storage_path, 300);
    const items = evidenceByObservation.get(record.observation_id) ?? [];
    items.push({ mimeType: record.mime_type, createdAt: record.created_at, signedUrl: signed.error ? null : signed.data.signedUrl });
    evidenceByObservation.set(record.observation_id, items);
  }
  const evidenceByStore = new Map<string, any>();
  for (const record of (verificationEvidenceResult.data ?? []) as any[]) {
    if (evidenceByStore.has(record.store_id)) continue;
    const signed = await admin.storage.from("verification-documents").createSignedUrl(record.evidence_storage_path, 300);
    evidenceByStore.set(record.store_id, { mimeType: record.evidence_mime_type, createdAt: record.created_at, signedUrl: signed.error ? null : signed.data.signedUrl });
  }

  return json({
    roles,
    queues: {
      stores: (storesResult.data ?? []).map((store: any) => ({ ...store, businessEvidence: evidenceByStore.get(store.id) ?? null })),
      listings: listings.map((x: any) => ({ ...x, product_name: productNames.get(x.product_id) ?? "Catalogue product", store_name: storeNames.get(x.seller_store_id) ?? "Seller store" })),
      priceObservations: prices.map((x: any) => ({ ...x, product_name: productNames.get(x.product_id) ?? "Catalogue product", evidenceFiles: evidenceByObservation.get(x.id) ?? [] })),
      productRequests: requests.map((x: any) => ({ ...x, category_name: categoryNames.get(x.category_id) ?? null })),
      reports: reportsResult.data ?? [],
      compatibilities: compatibilities.map((x: any) => ({ ...x, part_product_name: productNames.get(x.part_product_id) ?? "Part product", compatible_product_name: productNames.get(x.compatible_product_id) ?? "Compatible product" })),
    },
    limits: { perQueue: 50 },
  });
});