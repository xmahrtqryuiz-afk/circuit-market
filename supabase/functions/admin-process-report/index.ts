import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
const corsHeaders={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json"};
function json(data:unknown,status=200){return new Response(JSON.stringify(data),{status,headers:corsHeaders});}
function isUuid(v:unknown):v is string{return typeof v==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);}
Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:corsHeaders});
  if(req.method!=="POST")return json({error:"Method not allowed"},405);
  const auth=req.headers.get("Authorization");if(!auth?.startsWith("Bearer "))return json({error:"Sign in is required"},401);
  const url=Deno.env.get("SUPABASE_URL"),pubRaw=Deno.env.get("SUPABASE_PUBLISHABLE_KEYS"),secRaw=Deno.env.get("SUPABASE_SECRET_KEYS");
  const pubKey=pubRaw?JSON.parse(pubRaw).default:Deno.env.get("SUPABASE_ANON_KEY");
  const secKey=secRaw?JSON.parse(secRaw).default:Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!url||!pubKey||!secKey)return json({error:"Server configuration is incomplete"},500);
  const userClient=createClient(url,pubKey,{global:{headers:{Authorization:auth}},auth:{persistSession:false,autoRefreshToken:false}});
  const admin=createClient(url,secKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:userData,error:userError}=await userClient.auth.getUser();const user=userData.user;
  if(userError||!user)return json({error:"Your session could not be verified"},401);
  const {data:roles,error:roleError}=await admin.from("admin_user_roles").select("role").eq("user_id",user.id);
  if(roleError)return json({error:"Administrator permissions could not be checked"},500);
  const allowed=(roles??[]).some((r:{role:string})=>["super_admin","moderator","support"].includes(r.role));
  if(!allowed)return json({error:"You are not authorised to manage reports"},403);
  let body:{report_id?:unknown;decision?:unknown;note?:unknown};
  try{body=await req.json();}catch{return json({error:"A valid JSON request is required"},400);}
  if(!isUuid(body.report_id)||!["reviewing","resolved","dismissed"].includes(String(body.decision)))return json({error:"A valid report and decision are required"},400);
  const note=typeof body.note==="string"?body.note.slice(0,1000):null;
  const { data: result, error: processError } = await admin.rpc("admin_process_report_atomic", {
    p_actor_id: user.id,
    p_report_id: body.report_id,
    p_decision: String(body.decision),
    p_note: note,
  });
  if (processError) {
    const status = processError.code === "42501" ? 403 : processError.code === "P0002" ? 404
      : processError.code === "P0001" ? 409 : processError.code === "22023" ? 422 : 500;
    return json({ error: processError.message || "Report status could not be saved" }, status);
  }
  return json(result);
});