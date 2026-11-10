import type { IncomingMessage, ServerResponse } from "node:http";
import type { Pool } from "pg";
import { loadTenantContext } from "./tenant-access.js";
const ROLES = new Set(["foundation_chair","foundation_secretary","foundation_treasurer","pondok_leader","pondok_deputy","pondok_secretary","pondok_treasurer","academic_coordinator","student_affairs_coordinator","school_principal","homeroom_teacher","teacher","musyrif","finance_cashier","finance_verifier","procurement_officer","warehouse_staff","hr_officer","librarian","admission_officer","inventory_manager","boarding_supervisor","safeguarding_officer","cms_editor","read_only_auditor"]);
function reply(res:ServerResponse,status:number,data:unknown){res.statusCode=status;res.setHeader("content-type","application/json; charset=utf-8");res.setHeader("cache-control","no-store");res.end(JSON.stringify(data));}
async function body(req:IncomingMessage){const chunks:Buffer[]=[];let size=0;for await(const chunk of req){const b=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);size+=b.length;if(size>16384)return null;chunks.push(b);}try{const x:unknown=JSON.parse(Buffer.concat(chunks).toString("utf8"));return x&&typeof x==="object"&&!Array.isArray(x)?x as Record<string,unknown>:null;}catch{return null;}}
export async function handleTenantMembersRequest(req:IncomingMessage,res:ServerResponse,pool:Pick<Pool,"query">,actor:string,org:string):Promise<boolean>{
 const url=new URL(req.url??"/","http://pondok.local");
 if(url.pathname==="/v1/tenant/members"&&req.method==="GET"){
  const ctx=await loadTenantContext(pool as Pool,actor,org);if(!ctx){reply(res,403,{error:"active_membership_required"});return true;}if(!ctx.permissions.includes("core.members.manage")){reply(res,403,{error:"permission_denied"});return true;}
  const result=await pool.query(`SELECT om.id AS membership_id,om.user_id,om.membership_status,COALESCE(array_agg(DISTINCT r.role_key) FILTER(WHERE r.id IS NOT NULL),ARRAY[]::text[]) AS roles,COALESCE(array_agg(DISTINCT r.role_name) FILTER(WHERE r.id IS NOT NULL),ARRAY[]::text[]) AS role_names FROM core.organization_memberships om LEFT JOIN core.membership_roles mr ON mr.membership_id=om.id LEFT JOIN core.roles r ON r.id=mr.role_id WHERE om.organization_id=$1::uuid GROUP BY om.id ORDER BY om.created_at ASC LIMIT 500`,[org]);
  reply(res,200,{data:result.rows});return true;
 }
 const match=url.pathname.match(/^\/v1\/tenant\/members\/([0-9a-f-]{36})\/roles$/i);
 if(match&&req.method==="PATCH"){
  const ctx=await loadTenantContext(pool as Pool,actor,org);if(!ctx){reply(res,403,{error:"active_membership_required"});return true;}if(!ctx.permissions.includes("core.members.manage")){reply(res,403,{error:"permission_denied"});return true;}
  const memberId=match[1]!;if(memberId===ctx.membershipId){reply(res,409,{error:"self_role_change_forbidden"});return true;}
  const input=await body(req);if(!input||!Array.isArray(input.roleKeys)||input.roleKeys.length>12||input.roleKeys.some(k=>typeof k!=="string"||!ROLES.has(k))||new Set(input.roleKeys).size!==input.roleKeys.length){reply(res,422,{error:"invalid_role_keys"});return true;}
  const target=await pool.query<{user_id:string;membership_status:string;is_owner:boolean}>(`SELECT om.user_id,om.membership_status,COALESCE(bool_or(r.role_key='institution_owner'),false) AS is_owner FROM core.organization_memberships om LEFT JOIN core.membership_roles mr ON mr.membership_id=om.id LEFT JOIN core.roles r ON r.id=mr.role_id WHERE om.id=$1::uuid AND om.organization_id=$2::uuid GROUP BY om.id`,[memberId,org]);
  const m=target.rows[0];if(!m||m.membership_status!=="active"){reply(res,404,{error:"active_member_not_found"});return true;}if(m.is_owner){reply(res,409,{error:"owner_role_protected"});return true;}
  const keys=input.roleKeys as string[];const defs=keys.length?await pool.query<{id:string;role_key:string}>(`SELECT id,role_key FROM core.roles WHERE organization_id IS NULL AND is_system=true AND role_key=ANY($1::text[])`,[keys]):{rows:[] as {id:string;role_key:string}[]};
  if(defs.rows.length!==keys.length){reply(res,422,{error:"role_definition_not_found"});return true;}
  await pool.query(`DELETE FROM core.membership_roles mr USING core.roles r WHERE mr.role_id=r.id AND mr.membership_id=$1::uuid AND r.organization_id IS NULL AND r.role_key<>'institution_owner'`,[memberId]);
  for(const role of defs.rows)await pool.query("INSERT INTO core.membership_roles(membership_id,role_id) VALUES($1::uuid,$2::uuid) ON CONFLICT DO NOTHING",[memberId,role.id]);
  await pool.query(`INSERT INTO audit.audit_events(organization_id,actor_user_id,action,resource_type,resource_id,metadata) VALUES($1::uuid,$2::uuid,'tenant.member_roles.updated','membership',$3,jsonb_build_object('role_keys',$4::jsonb,'target_user_id',$5::text))`,[org,actor,memberId,JSON.stringify(keys),m.user_id]);
  reply(res,200,{data:{membershipId:memberId,roleKeys:keys}});return true;
 }
 return false;
}
