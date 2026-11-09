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
  const {data:record,error:recordError}=await admin.from("product_compatibilities")
    .select("id,submitted_by,review_status").eq("id",body.compatibility_id).maybeSingle();
  if(recordError||!record)return json({error:"Compatibility record not found"},404);
  if(record.submitted_by===user.id)return json({error:"You cannot review your own compatibility submission"},403);
  if(record.review_status!=="pending")return json({error:"This compatibility record has already been reviewed"},409);

  const notes=typeof body.notes==="string"?body.notes.slice(0,1000):null;
  const {data:updated,error:updateError}=await admin.from("product_compatibilities")
    .update({review_status:body.decision,reviewed_by:user.id,reviewed_at:new Date().toISOString(),notes})
    .eq("id",record.id).eq("review_status","pending").select("id,review_status").maybeSingle();
  if(updateError)return json({error:"Compatibility review could not be saved"},500);
  if(!updated)return json({error:"Compatibility record was reviewed by another administrator"},409);

  await admin.from("moderation_events").insert({actor_id:user.id,target_type:"product_compatibility",target_id:record.id,action:body.decision,reason:notes});
  await admin.from("audit_logs").insert({actor_id:user.id,action:"product_compatibility_"+body.decision,target_type:"product_compatibility",target_id:record.id});
  return json({success:true,compatibility_id:record.id,review_status:updated.review_status});
});