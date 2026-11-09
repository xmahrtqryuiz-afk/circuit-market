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
function slugify(value: string) {
  return value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g,"")
    .replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,100);
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

  const userClient = createClient(url,publishableKey,{
    global:{headers:{Authorization:authorization}},
    auth:{persistSession:false,autoRefreshToken:false},
  });
  const admin = createClient(url,secretKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:userData,error:userError} = await userClient.auth.getUser();
  const user = userData.user;
  if (userError || !user) return json({error:"Your session could not be verified"},401);

  const {data:roles,error:roleError} = await admin.from("admin_user_roles").select("role").eq("user_id",user.id);
  if (roleError) return json({error:"Administrator permissions could not be checked"},500);
  const allowed = (roles ?? []).some((r:{role:string})=>["super_admin","catalog_manager"].includes(r.role));
  if (!allowed) return json({error:"You are not authorised to manage the product catalogue"},403);

  let body:{request_id?:unknown;decision?:unknown;category_id?:unknown};
  try { body=await req.json(); } catch { return json({error:"A valid JSON request is required"},400); }
  if (!isUuid(body.request_id) || !["accept","reject"].includes(String(body.decision))) {
    return json({error:"A valid request and decision are required"},400);
  }

  const {data:request,error:requestError} = await admin.from("product_requests")
    .select("id,requested_by,requested_name,brand,model,product_type,category_id,request_status")
    .eq("id",body.request_id).maybeSingle();
  if (requestError || !request) return json({error:"Product request not found"},404);
  if (request.requested_by===user.id) return json({error:"You cannot approve your own product request"},403);
  if (request.request_status!=="pending") return json({error:"This product request has already been processed"},409);

  if (body.decision==="reject") {
    const {data:updated,error:updateError} = await admin.from("product_requests")
      .update({request_status:"rejected"}).eq("id",request.id).eq("request_status","pending")
      .select("id,request_status").maybeSingle();
    if (updateError) return json({error:"Product request could not be rejected"},500);
    if (!updated) return json({error:"Product request was processed by another administrator"},409);
    await admin.from("audit_logs").insert({actor_id:user.id,action:"product_request_rejected",target_type:"product_request",target_id:request.id});
    return json({success:true,request_status:"rejected"});
  }

  const categoryId = isUuid(body.category_id) ? body.category_id : request.category_id;
  if (!categoryId) return json({error:"Choose a catalogue category before accepting this request"},422);
  const {data:category,error:categoryError} = await admin.from("categories")
    .select("id,is_active").eq("id",categoryId).maybeSingle();
  if (categoryError || !category?.is_active) return json({error:"The selected category is not active"},422);

  const {data:duplicates,error:duplicateError} = await admin.from("products")
    .select("id,name,brand,model").eq("category_id",categoryId)
    .ilike("name",request.requested_name).limit(5);
  if (duplicateError) return json({error:"Catalogue duplicate check failed"},500);
  const existing = (duplicates ?? []).find((p:any)=>
    (p.brand ?? "").toLowerCase()===(request.brand ?? "").toLowerCase() &&
    (p.model ?? "").toLowerCase()===(request.model ?? "").toLowerCase()
  );
  if (existing) {
    const {data:updated,error:updateError} = await admin.from("product_requests")
      .update({request_status:"duplicate"}).eq("id",request.id).eq("request_status","pending")
      .select("id").maybeSingle();
    if (updateError || !updated) return json({error:"Product request could not be marked duplicate"},409);
    return json({success:true,request_status:"duplicate",existing_product_id:existing.id});
  }

  const baseSlug = slugify([request.brand,request.requested_name,request.model].filter(Boolean).join("-")) || "catalogue-product";
  let slug = baseSlug;
  const {data:slugMatch} = await admin.from("products").select("id").eq("slug",slug).maybeSingle();
  if (slugMatch) slug = baseSlug + "-" + crypto.randomUUID().slice(0,8);

  const {data:product,error:productError} = await admin.from("products").insert({
    category_id:categoryId,
    name:request.requested_name,
    brand:request.brand,
    model:request.model,
    slug,
    product_type:request.product_type,
    description:null,
    attributes:{},
    is_active:true,
  }).select("id").single();
  if (productError || !product) return json({error:"Catalogue product could not be created"},500);

  const {data:updated,error:updateError} = await admin.from("product_requests")
    .update({request_status:"accepted",category_id:categoryId})
    .eq("id",request.id).eq("request_status","pending")
    .select("id").maybeSingle();
  if (updateError || !updated) return json({error:"Product was created, but the request status could not be updated"},500);

  await admin.from("audit_logs").insert({
    actor_id:user.id,action:"catalogue_product_created",target_type:"product",target_id:product.id,
    metadata:{product_request_id:request.id},
  });
  return json({success:true,request_status:"accepted",product_id:product.id});
});