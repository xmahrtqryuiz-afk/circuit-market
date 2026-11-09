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
  const {data:report,error:reportError}=await admin.from("user_reports").select("id,reporter_id,report_status").eq("id",body.report_id).maybeSingle();
  if(reportError||!report)return json({error:"Report not found"},404);
  if(report.reporter_id===user.id)return json({error:"You cannot review your own report"},403);
  if(report.report_status==="resolved"||report.report_status==="dismissed")return json({error:"This report has already been closed"},409);
  const {data:updated,error:updateError}=await admin.from("user_reports").update({report_status:body.decision})
    .eq("id",report.id).eq("report_status",report.report_status).select("id,report_status").maybeSingle();
  if(updateError)return json({error:"Report status could not be saved"},500);
  if(!updated)return json({error:"Report was updated by another administrator"},409);
  const note=typeof body.note==="string"?body.note.slice(0,1000):null;
  await admin.from("moderation_events").insert({actor_id:user.id,target_type:"user_report",target_id:report.id,action:body.decision,reason:note});
  await admin.from("audit_logs").insert({actor_id:user.id,action:"user_report_"+body.decision,target_type:"user_report",target_id:report.id});
  return json({success:true,report_id:report.id,report_status:updated.report_status});
});