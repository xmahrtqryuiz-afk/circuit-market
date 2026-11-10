import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
function json(data: unknown,status=200){return new Response(JSON.stringify(data),{status,headers:corsHeaders});}
function isUuid(v:unknown):v is string{return typeof v==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:corsHeaders});
  if(req.method!=="POST")return json({error:"Method not allowed"},405);
  const authorization=req.headers.get("Authorization");
  if(!authorization?.startsWith("Bearer "))return json({error:"Sign in is required"},401);
  const url=Deno.env.get("SUPABASE_URL");
  const pubRaw=Deno.env.get("SUPABASE_PUBLISHABLE_KEYS");
  const secRaw=Deno.env.get("SUPABASE_SECRET_KEYS");
  const pubKey=pubRaw?JSON.parse(pubRaw).default:Deno.env.get("SUPABASE_ANON_KEY");
  const secKey=secRaw?JSON.parse(secRaw).default:Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!url||!pubKey||!secKey)return json({error:"Server configuration is incomplete"},500);

  const userClient=createClient(url,pubKey,{global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false}});
  const admin=createClient(url,secKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:userData,error:userError}=await userClient.auth.getUser();
  const user=userData.user;
  if(userError||!user)return json({error:"Your session could not be verified"},401);

  const {data:roles,error:roleError}=await admin.from("admin_user_roles").select("role").eq("user_id",user.id);
  if(roleError)return json({error:"Administrator permissions could not be checked"},500);
  const allowed=(roles??[]).some((r:{role:string})=>["super_admin","catalog_manager"].includes(r.role));
  if(!allowed)return json({error:"You are not authorised to review compatibility data"},403);

  let body:{compatibility_id?:unknown;decision?:unknown;notes?:unknown};
  try{body=await req.json();}catch{return json({error:"A valid JSON request is required"},400);}
  if(!isUuid(body.compatibility_id)||!["approved","rejected"].includes(String(body.decision))){
    return json({error:"A valid compatibility record and decision are required"},400);
  }
  const notes=typeof body.notes==="string"?body.notes.slice(0,1000):null;
  const { data: result, error: reviewError } = await admin.rpc("admin_review_compatibility_atomic", {
    p_actor_id: user.id,
    p_compatibility_id: body.compatibility_id,
    p_decision: String(body.decision),
    p_notes: notes,
  });
  if (reviewError) {
    const status = reviewError.code === "42501" ? 403 : reviewError.code === "P0002" ? 404
      : reviewError.code === "P0001" ? 409 : reviewError.code === "22023" ? 422 : 500;
    return json({ error: reviewError.message || "Compatibility review could not be saved" }, status);
  }
  return json(result);
});