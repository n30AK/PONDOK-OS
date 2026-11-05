import type { IncomingMessage, ServerResponse } from "node:http";
import type { TenantDatabase } from "./tenant-db.js";

type Json=Record<string,unknown>;
type Client={query<T=unknown>(sql:string,values?:unknown[]):Promise<{rows:T[]}>;release():void};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PRODUCT_TYPES=["subscription","one_time","service","module"] as const;
const BILLING_INTERVALS=["monthly","quarterly","yearly","one_time"] as const;
function reply(res:ServerResponse,status:number,body:unknown){res.writeHead(status,{"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff","referrer-policy":"no-referrer"});res.end(JSON.stringify(body));}
function isRecord(v:unknown):v is Json{return typeof v==="object"&&v!==null&&!Array.isArray(v);}
async function readJson(req:IncomingMessage):Promise<Json|null>{
 const chunks:Buffer[]=[];let size=0;
 for await(const chunk of req){const part=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);size+=part.length;if(size>16384)return null;chunks.push(part);}
 try{const value:unknown=JSON.parse(Buffer.concat(chunks).toString("utf8"));return isRecord(value)?value:null;}catch{return null;}
}
function validEmail(v:unknown){return v===null||v===undefined||(typeof v==="string"&&v.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()));}
export function validateCustomerContact(v:Json):string|null{
 if(typeof v.fullName!=="string"||v.fullName.trim().length<2||v.fullName.length>160)return "invalid_contact_name";
 if(v.positionTitle!==undefined&&v.positionTitle!==null&&(typeof v.positionTitle!=="string"||v.positionTitle.length>120))return "invalid_position_title";
 if(!validEmail(v.email))return "invalid_contact_email";
 if(v.phone!==undefined&&v.phone!==null&&(typeof v.phone!=="string"||v.phone.length>40))return "invalid_contact_phone";
 if(v.isPrimary!==undefined&&typeof v.isPrimary!=="boolean")return "invalid_primary_contact_flag";
 if(v.contactPreferences!==undefined&&!isRecord(v.contactPreferences))return "invalid_contact_preferences";
 if(v.contactPreferences&&JSON.stringify(v.contactPreferences).length>4000)return "contact_preferences_too_large";
 return null;
}
export function validateProduct(v:Json):string|null{
 if(typeof v.productName!=="string"||v.productName.trim().length<2||v.productName.length>180)return "invalid_product_name";
 if(v.description!==undefined&&v.description!==null&&(typeof v.description!=="string"||v.description.length>5000))return "invalid_product_description";
 if(v.productType!==undefined&&!PRODUCT_TYPES.includes(v.productType as typeof PRODUCT_TYPES[number]))return "invalid_product_type";
 if(v.basePrice!==undefined&&(typeof v.basePrice!=="number"||!Number.isFinite(v.basePrice)||v.basePrice<0||v.basePrice>1_000_000_000_000_000))return "invalid_base_price";
 if(v.currency!==undefined&&(typeof v.currency!=="string"||!/^[A-Z]{3}$/.test(v.currency)))return "invalid_currency";
 if(v.billingInterval!==undefined&&v.billingInterval!==null&&!BILLING_INTERVALS.includes(v.billingInterval as typeof BILLING_INTERVALS[number]))return "invalid_billing_interval";
 return null;
}
async function withAdmin<T>(pool:TenantDatabase,userId:string,work:(c:Client)=>Promise<T>):Promise<{forbidden:boolean;value?:T}>{
 if(!pool.connect)throw new Error("platform_transaction_unavailable");
 const c=await pool.connect() as Client;let active=false;
 try{
  await c.query("BEGIN");active=true;
  const auth=await c.query<{allowed:boolean}>("SELECT EXISTS(SELECT 1 FROM platform.super_admins WHERE user_id=$1::uuid AND status='active') AS allowed",[userId]);
  if(auth.rows[0]?.allowed!==true){await c.query("ROLLBACK");active=false;return{forbidden:true};}
  await c.query("SELECT set_config('app.user_id',$1,true)",[userId]);
  await c.query("SET LOCAL ROLE pondok_platform_runtime");
  const value=await work(c);await c.query("COMMIT");active=false;return{forbidden:false,value};
 }catch(e){if(active)await c.query("ROLLBACK").catch(()=>undefined);throw e;}finally{c.release();}
}
async function audit(c:Client,userId:string,action:string,type:string,id:string,metadata:Json={}){
 await c.query("INSERT INTO platform.audit_events(actor_user_id,action,resource_type,resource_id,metadata) VALUES($1::uuid,$2,$3,$4::uuid,$5::jsonb)",[userId,action,type,id,JSON.stringify(metadata)]);
}
function errorCode(e:unknown){return typeof e==="object"&&e!==null&&"code"in e?String((e as {code:unknown}).code):"";}

export async function handlePlatformCustomerCatalogRequest(req:IncomingMessage,res:ServerResponse,pool:TenantDatabase,userId:string):Promise<boolean>{
 const url=new URL(req.url??"/","http://localhost"),path=url.pathname;
 const contactCollection=path.match(/^\/v1\/platform\/erp\/customers\/([0-9a-f-]{36})\/contacts$/i);
 const contactItem=path.match(/^\/v1\/platform\/erp\/customers\/([0-9a-f-]{36})\/contacts\/([0-9a-f-]{36})$/i);
 const catalogCollection=path==="/v1/platform/erp/catalog";
 const productItem=path.match(/^\/v1\/platform\/erp\/catalog\/([0-9a-f-]{36})$/i);
 if(!contactCollection&&!contactItem&&!catalogCollection&&!productItem)return false;
 const customerId=contactCollection?.[1]??contactItem?.[1],contactId=contactItem?.[2],productId=productItem?.[1];
 if((customerId&&!UUID.test(customerId))||(contactId&&!UUID.test(contactId))||(productId&&!UUID.test(productId))){reply(res,400,{error:"invalid_resource_id"});return true;}

 if(req.method==="GET"){
  try{
   const scoped=await withAdmin(pool,userId,async c=>{
    if(contactCollection){
     const result=await c.query(`SELECT id,customer_id AS "customerId",full_name AS "fullName",position_title AS "positionTitle",email,phone,is_primary AS "isPrimary",contact_preferences AS "contactPreferences",created_at AS "createdAt" FROM platform.customer_contacts WHERE customer_id=$1::uuid ORDER BY is_primary DESC,full_name ASC`,[customerId]);
     return {items:result.rows,returned:result.rows.length};
    }
    if(catalogCollection){
     const q=(url.searchParams.get("q")??"").trim().slice(0,100);
     const activeOnly=url.searchParams.get("activeOnly")==="true";
     const result=await c.query(`SELECT id,product_code AS "productCode",product_name AS "productName",description,product_type AS "productType",base_price AS "basePrice",currency,billing_interval AS "billingInterval",is_active AS "isActive",created_at AS "createdAt",updated_at AS "updatedAt" FROM platform.product_catalog WHERE ($1='%%' OR product_code ILIKE $1 OR product_name ILIKE $1) AND ($2::boolean=false OR is_active=true) ORDER BY product_name LIMIT 100`,[`%${q.replace(/[\\%_]/g,"\\$&")}%`,activeOnly]);
     return {items:result.rows,returned:result.rows.length};
    }
    if(productId){
     const result=await c.query(`SELECT id,product_code AS "productCode",product_name AS "productName",description,product_type AS "productType",base_price AS "basePrice",currency,billing_interval AS "billingInterval",is_active AS "isActive",created_at AS "createdAt",updated_at AS "updatedAt" FROM platform.product_catalog WHERE id=$1::uuid`,[productId]);
     return {item:result.rows[0]??null};
    }
    return null;
   });
   if(scoped.forbidden){reply(res,403,{error:"platform_super_admin_required"});return true;}
   if(!scoped.value){reply(res,404,{error:"resource_not_found"});return true;}
   if("item"in scoped.value&&!scoped.value.item){reply(res,404,{error:"product_not_found"});return true;}
   reply(res,200,{data:scoped.value});
  }catch(e){reply(res,errorCode(e)==="42P01"?503:500,{error:"platform_customer_catalog_read_failed"});}
  return true;
 }

 if(req.method==="POST"&&contactCollection){
  const body=await readJson(req);if(!body){reply(res,400,{error:"invalid_json_or_body_too_large"});return true;}
  const invalid=validateCustomerContact(body);if(invalid){reply(res,422,{error:invalid});return true;}
  try{
   const scoped=await withAdmin(pool,userId,async c=>{
    const customer=await c.query("SELECT id FROM platform.customers WHERE id=$1::uuid",[customerId]);
    if(!customer.rows[0])return{notFound:true as const};
    if(body.isPrimary===true)await c.query("UPDATE platform.customer_contacts SET is_primary=false WHERE customer_id=$1::uuid AND is_primary=true",[customerId]);
    const result=await c.query(`INSERT INTO platform.customer_contacts(customer_id,full_name,position_title,email,phone,is_primary,contact_preferences) VALUES($1::uuid,$2,$3,$4,$5,$6,$7::jsonb) RETURNING id,customer_id AS "customerId",full_name AS "fullName",position_title AS "positionTitle",email,phone,is_primary AS "isPrimary",contact_preferences AS "contactPreferences",created_at AS "createdAt"`,[customerId,String(body.fullName).trim(),body.positionTitle??null,body.email?String(body.email).trim().toLowerCase():null,body.phone??null,body.isPrimary===true,JSON.stringify(body.contactPreferences??{})]);
    const row=result.rows[0] as {id:string}|undefined;if(!row)throw new Error("contact_insert_failed");
    await audit(c,userId,"crm.customer_contact.created","customer_contact",row.id,{customerId,isPrimary:body.isPrimary===true});
    return{data:result.rows[0]};
   });
   if(scoped.forbidden){reply(res,403,{error:"platform_super_admin_required"});return true;}
   if(scoped.value?.notFound){reply(res,404,{error:"customer_not_found"});return true;}
   reply(res,201,{data:scoped.value?.data});
  }catch(e){reply(res,errorCode(e)==="23505"?409:500,{error:"customer_contact_create_failed"});}
  return true;
 }

 if(req.method==="POST"&&catalogCollection){
  const body=await readJson(req);if(!body){reply(res,400,{error:"invalid_json_or_body_too_large"});return true;}
  const invalid=validateProduct(body);if(invalid){reply(res,422,{error:invalid});return true;}
  try{
   const scoped=await withAdmin(pool,userId,async c=>{
    const productCode=`PRD-${new Date().toISOString().slice(0,10).replace(/-/g,"")}-${(await import("node:crypto")).randomUUID().slice(0,8).toUpperCase()}`;
    const result=await c.query(`INSERT INTO platform.product_catalog(product_code,product_name,description,product_type,base_price,currency,billing_interval) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id,product_code AS "productCode",product_name AS "productName",description,product_type AS "productType",base_price AS "basePrice",currency,billing_interval AS "billingInterval",is_active AS "isActive",created_at AS "createdAt"`,[productCode,String(body.productName).trim(),body.description??null,body.productType??"subscription",body.basePrice??0,body.currency??"IDR",body.billingInterval??null]);
    const row=result.rows[0] as {id:string}|undefined;if(!row)throw new Error("product_insert_failed");
    await audit(c,userId,"catalog.product.created","product",row.id,{productCode,productType:body.productType??"subscription"});
    return result.rows[0];
   });
   if(scoped.forbidden){reply(res,403,{error:"platform_super_admin_required"});return true;}
   reply(res,201,{data:scoped.value});
  }catch(e){reply(res,errorCode(e)==="23505"?409:500,{error:"product_create_failed"});}
  return true;
 }

 if(req.method==="PATCH"&&contactItem){
  const body=await readJson(req);if(!body||Object.keys(body).length===0){reply(res,400,{error:"invalid_json_or_empty_update"});return true;}
  const invalid=validateCustomerContact({...body,fullName:body.fullName??"Valid Contact"});if(invalid){reply(res,422,{error:invalid});return true;}
  const allowed=new Set(["fullName","positionTitle","email","phone","isPrimary","contactPreferences"]);
  if(Object.keys(body).some(k=>!allowed.has(k))){reply(res,422,{error:"unsupported_contact_update_field"});return true;}
  try{
   const scoped=await withAdmin(pool,userId,async c=>{
    const exists=await c.query("SELECT id FROM platform.customer_contacts WHERE id=$1::uuid AND customer_id=$2::uuid",[contactId,customerId]);
    if(!exists.rows[0])return null;
    if(body.isPrimary===true)await c.query("UPDATE platform.customer_contacts SET is_primary=false WHERE customer_id=$1::uuid AND id<>$2::uuid AND is_primary=true",[customerId,contactId]);
    const fields:Array<[string,string]>=[["fullName","full_name"],["positionTitle","position_title"],["email","email"],["phone","phone"],["isPrimary","is_primary"],["contactPreferences","contact_preferences"]];
    const values:unknown[]=[contactId,customerId],sets:string[]=[];
    for(const [key,col] of fields)if(Object.hasOwn(body,key)){values.push(key==="contactPreferences"?JSON.stringify(body[key]):key==="email"&&body[key]?String(body[key]).trim().toLowerCase():body[key]);sets.push(`${col}=$${values.length}${key==="contactPreferences"?"::jsonb":""}`);}
    const result=await c.query(`UPDATE platform.customer_contacts SET ${sets.join(",")} WHERE id=$1::uuid AND customer_id=$2::uuid RETURNING id,customer_id AS "customerId",full_name AS "fullName",position_title AS "positionTitle",email,phone,is_primary AS "isPrimary",contact_preferences AS "contactPreferences",created_at AS "createdAt"`,values);
    await audit(c,userId,"crm.customer_contact.updated","customer_contact",contactId,{changedFields:Object.keys(body)});
    return result.rows[0]??null;
   });
   if(scoped.forbidden){reply(res,403,{error:"platform_super_admin_required"});return true;}
   if(!scoped.value){reply(res,404,{error:"customer_contact_not_found"});return true;}
   reply(res,200,{data:scoped.value});
  }catch{reply(res,500,{error:"customer_contact_update_failed"});}
  return true;
 }

 if(req.method==="PATCH"&&productId){
  const body=await readJson(req);if(!body||Object.keys(body).length===0){reply(res,400,{error:"invalid_json_or_empty_update"});return true;}
  const allowed=new Set(["productName","description","basePrice","billingInterval","isActive"]);
  if(Object.keys(body).some(k=>!allowed.has(k))){reply(res,422,{error:"unsupported_product_update_field"});return true;}
  const invalid=validateProduct({...body,productName:body.productName??"Valid Product"});if(invalid){reply(res,422,{error:invalid});return true;}
  if(body.isActive!==undefined&&typeof body.isActive!=="boolean"){reply(res,422,{error:"invalid_is_active"});return true;}
  try{
   const scoped=await withAdmin(pool,userId,async c=>{
    const fields:Array<[string,string]>=[["productName","product_name"],["description","description"],["basePrice","base_price"],["billingInterval","billing_interval"],["isActive","is_active"]];
    const values:unknown[]=[productId],sets:string[]=[];
    for(const [key,col] of fields)if(Object.hasOwn(body,key)){values.push(body[key]);sets.push(`${col}=$${values.length}`);}
    sets.push("updated_at=now()");
    const result=await c.query(`UPDATE platform.product_catalog SET ${sets.join(",")} WHERE id=$1::uuid RETURNING id,product_code AS "productCode",product_name AS "productName",description,product_type AS "productType",base_price AS "basePrice",currency,billing_interval AS "billingInterval",is_active AS "isActive",updated_at AS "updatedAt"`,values);
    const row=result.rows[0] as {id:string}|undefined;if(row)await audit(c,userId,"catalog.product.updated","product",productId,{changedFields:Object.keys(body)});
    return row??null;
   });
   if(scoped.forbidden){reply(res,403,{error:"platform_super_admin_required"});return true;}
   if(!scoped.value){reply(res,404,{error:"product_not_found"});return true;}
   reply(res,200,{data:scoped.value});
  }catch{reply(res,500,{error:"product_update_failed"});}
  return true;
 }
 reply(res,405,{error:"method_not_allowed"});return true;
}
