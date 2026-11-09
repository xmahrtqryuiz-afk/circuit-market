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
  const {data:myRoles,error:myRoleError}=await admin.from("admin_user_roles").select("role").eq("user_id",user.id);
  if(myRoleError)return json({error:"Administrator permissions could not be checked"},500);
  if(!(myRoles??[]).some((r:{role:string})=>r.role==="super_admin"))return json({error:"Only a super administrator can manage administrator roles"},403);

  let body:{user_id?:unknown;role?:unknown;action?:unknown};
  try{body=await req.json();}catch{return json({error:"A valid JSON request is required"},400);}
  const validRoles=["super_admin","moderator","support","price_reviewer","catalog_manager"];
  if(!isUuid(body.user_id)||!validRoles.includes(String(body.role))||!["grant","revoke"].includes(String(body.action))){
    return json({error:"A valid user, administrator role and action are required"},400);
  }
  const targetId=body.user_id,role=String(body.role),action=String(body.action);
  if(action==="revoke"&&role==="super_admin"){
    const {count,error:countError}=await admin.from("admin_user_roles").select("id",{count:"exact",head:true})
      .eq("role","super_admin");
    if(countError)return json({error:"Administrator count could not be checked"},500);
    if((count??0)<=1)return json({error:"The last super administrator cannot be removed"},409);
  }
  if(action==="grant"){
    const {error}=await admin.from("admin_user_roles").insert({user_id:targetId,role,granted_by:user.id});
    if(error&&error.code!=="23505")return json({error:"Administrator role could not be granted"},500);
  }else{
    const {error}=await admin.from("admin_user_roles").delete().eq("user_id",targetId).eq("role",role);
    if(error)return json({error:"Administrator role could not be revoked"},500);
  }
  await admin.from("audit_logs").insert({
    actor_id:user.id,action:"admin_role_"+action,target_type:"user",target_id:targetId,
    metadata:{role},
  });
  return json({success:true,user_id:targetId,role,action});
});