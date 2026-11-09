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

  const { data: result, error: processError } = await admin.rpc("admin_process_product_request_atomic", {
    p_actor_id: user.id,
    p_request_id: body.request_id,
    p_decision: String(body.decision),
    p_category_id: isUuid(body.category_id) ? body.category_id : null,
  });
  if (processError) {
    const status = processError.code === "42501" ? 403
      : processError.code === "P0002" ? 404
      : processError.code === "P0001" ? 409
      : processError.code === "22023" ? 422 : 500;
    return json({ error: processError.message || "Product request could not be processed" }, status);
  }
  return json(result);
});