import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { TenantDatabase } from "./tenant-db.js";

type Json=Record<string,unknown>;
type Client={query<T=unknown>(sql:string,values?:unknown[]):Promise<{rows:T[]}>;release():void};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RENEWAL=["manual","automatic","none"] as const;
function reply(res:ServerResponse,status:number,body:unknown){res.writeHead(status,{"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff","referrer-policy":"no-referrer"});res.end(JSON.stringify(body));}
function isRecord(v:unknown):v is Json{return typeof v==="object"&&v!==null&&!Array.isArray(v);}
async function readJson(req:IncomingMessage):Promise<Json|null>{
 const chunks:Buffer[]=[];let size=0;for await(const chunk of req){const part=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);size+=part.length;if(size>65536)return null;chunks.push(part);}
 try{const v:unknown=JSON.parse(Buffer.concat(chunks).toString("utf8"));return isRecord(v)?v:null;}catch{return null;}
}
function cents(v:unknown):number|null{
 if(typeof v!=="number"||!Number.isFinite(v)||v<0||v>1_000_000_000_000)return null;
 const scaled=v*100;if(Math.abs(scaled-Math.round(scaled))>1e-7)return null;return Math.round(scaled);
}
function quantityMilli(v:unknown):number|null{
 if(typeof v!=="number"||!Number.isFinite(v)||v<=0||v>1_000_000_000)return null;
 const scaled=v*1000;if(Math.abs(scaled-Math.round(scaled))>1e-7)return null;return Math.round(scaled);
}
function money(v:number){return (v/100).toFixed(2);}
function dateOnly(v:unknown){if(typeof v!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(v))return false;const parts=v.split("-");if(parts.length!==3)return false;const y=Number(parts[0]),m=Number(parts[1]),d=Number(parts[2]);if(!Number.isInteger(y)||!Number.isInteger(m)||!Number.isInteger(d))return false;const date=new Date(Date.UTC(y,m-1,d));return date.getUTCFullYear()===y&&date.getUTCMonth()===m-1&&date.getUTCDate()===d;}
function grossCents(quantity:number,price:number):number|null{const total=(BigInt(quantity)*BigInt(price)+500n)/1000n;return total>1_000_000_000_000n?null:Number(total);}
export function validateQuoteInput(v:Json):string|null{
 if(typeof v.customerId!=="string"||!UUID.test(v.customerId))return "invalid_customer_id";
 if(v.currency!==undefined&&(typeof v.currency!=="string"||!/^[A-Z]{3}$/.test(v.currency)))return "invalid_currency";
 if(v.validUntil!==undefined&&v.validUntil!==null&&!dateOnly(v.validUntil))return "invalid_valid_until";
 if(!Array.isArray(v.lines)||v.lines.length<1||v.lines.length>50)return "quote_requires_1_to_50_lines";
 for(let i=0;i<v.lines.length;i++){
  const line=v.lines[i];if(!isRecord(line))return "invalid_quote_line";
  if(typeof line.description!=="string"||line.description.trim().length<2||line.description.length>500)return "invalid_line_description";
  if(line.productId!==undefined&&line.productId!==null&&(typeof line.productId!=="string"||!UUID.test(line.productId)))return "invalid_product_id";
  if(quantityMilli(line.quantity)===null)return "invalid_line_quantity";
  const price=cents(line.unitPrice),discount=cents(line.discountAmount??0),tax=cents(line.taxAmount??0);
  if(price===null)return "invalid_unit_price";if(discount===null)return "invalid_line_discount";if(tax===null)return "invalid_line_tax";
  const gross=grossCents(quantityMilli(line.quantity)!,price);
  if(gross===null)return "line_total_too_large";
  if(discount>gross)return "line_discount_exceeds_gross";
  if(gross-discount+tax>1_000_000_000_000)return "line_total_too_large";
 }
 return null;
}
export function validateContractInput(v:Json):string|null{
 if(typeof v.quoteId!=="string"||!UUID.test(v.quoteId))return "invalid_quote_id";
 if(v.startsOn!==undefined&&v.startsOn!==null&&!dateOnly(v.startsOn))return "invalid_contract_start_date";
 if(v.endsOn!==undefined&&v.endsOn!==null&&!dateOnly(v.endsOn))return "invalid_contract_end_date";
 if(v.startsOn&&v.endsOn&&String(v.endsOn)<String(v.startsOn))return "contract_end_before_start";
 if(v.renewalMode!==undefined&&!RENEWAL.includes(v.renewalMode as typeof RENEWAL[number]))return "invalid_renewal_mode";
 return null;
}
async function withAdmin<T>(pool:TenantDatabase,userId:string,work:(c:Client)=>Promise<T>):Promise<{forbidden:boolean;value?:T}>{
 if(!pool.connect)throw new Error("platform_transaction_unavailable");
 const c=await pool.connect() as Client;let active=false;
 try{
  await c.query("BEGIN");active=true;
  const auth=await c.query<{allowed:boolean}>("SELECT EXISTS(SELECT 1 FROM platform.super_admins WHERE user_id=$1::uuid AND status='active') AS allowed",[userId]);
  if(auth.rows[0]?.allowed!==true){await c.query("ROLLBACK");active=false;return{forbidden:true};}
  await c.query("SELECT set_config('app.user_id',$1,true)",[userId]);await c.query("SET LOCAL ROLE pondok_platform_runtime");
  const value=await work(c);await c.query("COMMIT");active=false;return{forbidden:false,value};
 }catch(e){if(active)await c.query("ROLLBACK").catch(()=>undefined);throw e;}finally{c.release();}
}
async function audit(c:Client,userId:string,action:string,type:string,id:string,metadata:Json={}){
 await c.query("INSERT INTO platform.audit_events(actor_user_id,action,resource_type,resource_id,metadata) VALUES($1::uuid,$2,$3,$4::uuid,$5::jsonb)",[userId,action,type,id,JSON.stringify(metadata)]);
}
function errorCode(e:unknown){return typeof e==="object"&&e!==null&&"code"in e?String((e as {code:unknown}).code):"";}
function numberId(prefix:string){return `${prefix}-${new Date().toISOString().slice(0,10).replace(/-/g,"")}-${randomUUID().slice(0,8).toUpperCase()}`;}

export async function handlePlatformCommercialRequest(req:IncomingMessage,res:ServerResponse,pool:TenantDatabase,userId:string):Promise<boolean>{
 const url=new URL(req.url??"/","http://localhost"),path=url.pathname;
 const quoteCollection=path==="/v1/platform/erp/quotes";
 const quoteAction=path.match(/^\/v1\/platform\/erp\/quotes\/([0-9a-f-]{36})\/(submit|approve|reject)$/i);
 const quoteItem=path.match(/^\/v1\/platform\/erp\/quotes\/([0-9a-f-]{36})$/i);
 const contractCollection=path==="/v1/platform/erp/contracts";
 const contractAction=path.match(/^\/v1\/platform\/erp\/contracts\/([0-9a-f-]{36})\/(submit|approve|reject)$/i);
 const contractItem=path.match(/^\/v1\/platform\/erp\/contracts\/([0-9a-f-]{36})$/i);
 if(!quoteCollection&&!quoteAction&&!quoteItem&&!contractCollection&&!contractAction&&!contractItem)return false;
 const quoteId=quoteAction?.[1]??quoteItem?.[1],quoteVerb=quoteAction?.[2]?.toLowerCase();
 const contractId=contractAction?.[1]??contractItem?.[1],contractVerb=contractAction?.[2]?.toLowerCase();
 if((quoteId&&!UUID.test(quoteId))||(contractId&&!UUID.test(contractId))){reply(res,400,{error:"invalid_resource_id"});return true;}

 if(req.method==="GET"){
  try{
   const scoped=await withAdmin(pool,userId,async c=>{
    if(quoteCollection){
     const result=await c.query(`SELECT q.id,q.quote_number AS "quoteNumber",q.customer_id AS "customerId",cu.display_name AS "customerName",q.status,q.currency,q.subtotal,q.discount_total AS "discountTotal",q.tax_total AS "taxTotal",q.grand_total AS "grandTotal",q.valid_until AS "validUntil",q.created_at AS "createdAt",q.updated_at AS "updatedAt" FROM platform.quotes q JOIN platform.customers cu ON cu.id=q.customer_id ORDER BY q.created_at DESC LIMIT 100`);
     return{items:result.rows,returned:result.rows.length};
    }
    if(quoteItem){
     const header=await c.query(`SELECT q.id,q.quote_number AS "quoteNumber",q.customer_id AS "customerId",cu.display_name AS "customerName",q.status,q.currency,q.subtotal,q.discount_total AS "discountTotal",q.tax_total AS "taxTotal",q.grand_total AS "grandTotal",q.valid_until AS "validUntil",q.created_by AS "createdBy",q.approved_by AS "approvedBy",q.approved_at AS "approvedAt",q.created_at AS "createdAt",q.updated_at AS "updatedAt" FROM platform.quotes q JOIN platform.customers cu ON cu.id=q.customer_id WHERE q.id=$1::uuid`,[quoteId]);
     if(!header.rows[0])return{notFound:true as const,item:null};
     const lines=await c.query(`SELECT id,product_id AS "productId",description,quantity,unit_price AS "unitPrice",discount_amount AS "discountAmount",tax_amount AS "taxAmount",line_total AS "lineTotal" FROM platform.quote_lines WHERE quote_id=$1::uuid ORDER BY id`,[quoteId]);
     return{notFound:false as const,item:{...(header.rows[0] as Record<string,unknown>),lines:lines.rows}};
    }
    if(contractCollection){
     const result=await c.query(`SELECT k.id,k.contract_number AS "contractNumber",k.customer_id AS "customerId",cu.display_name AS "customerName",k.quote_id AS "quoteId",k.status,k.starts_on AS "startsOn",k.ends_on AS "endsOn",k.renewal_mode AS "renewalMode",k.created_at AS "createdAt" FROM platform.contracts k JOIN platform.customers cu ON cu.id=k.customer_id ORDER BY k.created_at DESC LIMIT 100`);
     return{items:result.rows,returned:result.rows.length};
    }
    if(contractItem){
     const result=await c.query(`SELECT k.id,k.contract_number AS "contractNumber",k.customer_id AS "customerId",cu.display_name AS "customerName",k.quote_id AS "quoteId",k.status,k.starts_on AS "startsOn",k.ends_on AS "endsOn",k.renewal_mode AS "renewalMode",k.created_by AS "createdBy",k.approved_by AS "approvedBy",k.approved_at AS "approvedAt",k.created_at AS "createdAt",k.updated_at AS "updatedAt" FROM platform.contracts k JOIN platform.customers cu ON cu.id=k.customer_id WHERE k.id=$1::uuid`,[contractId]);
     return{item:result.rows[0]??null};
    }
    return null;
   });
   if(scoped.forbidden){reply(res,403,{error:"platform_super_admin_required"});return true;}
   if(!scoped.value){reply(res,404,{error:"resource_not_found"});return true;}
   if("notFound"in scoped.value&&scoped.value.notFound){reply(res,404,{error:"quote_not_found"});return true;}
   if("item"in scoped.value&&!scoped.value.item){reply(res,404,{error:"contract_not_found"});return true;}
   reply(res,200,{data:scoped.value});
  }catch(e){reply(res,errorCode(e)==="42P01"?503:500,{error:"platform_commercial_read_failed"});}
  return true;
 }

 if(req.method==="POST"&&quoteCollection){
  const body=await readJson(req);if(!body){reply(res,400,{error:"invalid_json_or_body_too_large"});return true;}
  const invalid=validateQuoteInput(body);if(invalid){reply(res,422,{error:invalid});return true;}
  const lines=(body.lines as Json[]).map(line=>{
   const qty=quantityMilli(line.quantity)!,price=cents(line.unitPrice)!,discount=cents(line.discountAmount??0)!,tax=cents(line.taxAmount??0)!;
   const gross=grossCents(qty,price)!,total=gross-discount+tax;
   return{productId:line.productId??null,description:String(line.description).trim(),quantity:(qty/1000).toFixed(3),unitPrice:money(price),discountAmount:money(discount),taxAmount:money(tax),lineTotal:money(total),gross};
  });
  const subtotal=lines.reduce((s,x)=>s+x.gross,0),discountTotal=lines.reduce((s,x)=>s+Math.round(Number(x.discountAmount)*100),0),taxTotal=lines.reduce((s,x)=>s+Math.round(Number(x.taxAmount)*100),0),grandTotal=subtotal-discountTotal+taxTotal;
  try{
   const scoped=await withAdmin(pool,userId,async c=>{
    const customer=await c.query("SELECT id FROM platform.customers WHERE id=$1::uuid",[body.customerId]);
    if(!customer.rows[0])return{notFound:true as const,item:null};
    for(const line of lines)if(line.productId){const product=await c.query("SELECT id FROM platform.product_catalog WHERE id=$1::uuid AND is_active=true",[line.productId]);if(!product.rows[0])return{invalidProduct:true as const,item:null};}
    const id=numberId("QT");
    const header=await c.query(`INSERT INTO platform.quotes(quote_number,customer_id,status,currency,subtotal,discount_total,tax_total,grand_total,valid_until,created_by) VALUES($1,$2::uuid,'draft',$3,$4::numeric,$5::numeric,$6::numeric,$7::numeric,$8::date,$9::uuid) RETURNING id,quote_number AS "quoteNumber",customer_id AS "customerId",status,currency,subtotal,discount_total AS "discountTotal",tax_total AS "taxTotal",grand_total AS "grandTotal",valid_until AS "validUntil",created_at AS "createdAt"`,[id,body.customerId,body.currency??"IDR",money(subtotal),money(discountTotal),money(taxTotal),money(grandTotal),body.validUntil??null,userId]);
    const row=header.rows[0] as {id:string}|undefined;if(!row)throw new Error("quote_insert_failed");
    for(const line of lines)await c.query(`INSERT INTO platform.quote_lines(quote_id,product_id,description,quantity,unit_price,discount_amount,tax_amount,line_total) VALUES($1::uuid,$2::uuid,$3,$4::numeric,$5::numeric,$6::numeric,$7::numeric,$8::numeric)`,[row.id,line.productId,line.description,line.quantity,line.unitPrice,line.discountAmount,line.taxAmount,line.lineTotal]);
    await audit(c,userId,"commercial.quote.created","quote",row.id,{lineCount:lines.length,currency:body.currency??"IDR",grandTotal:money(grandTotal)});
    return{notFound:false as const,invalidProduct:false as const,item:header.rows[0]};
   });
   if(scoped.forbidden){reply(res,403,{error:"platform_super_admin_required"});return true;}
   if(scoped.value && "notFound" in scoped.value && scoped.value.notFound){reply(res,404,{error:"customer_not_found"});return true;}
   if(scoped.value && "invalidProduct" in scoped.value && scoped.value.invalidProduct){reply(res,422,{error:"inactive_or_unknown_product"});return true;}
   reply(res,201,{data:scoped.value?.item});
  }catch(e){reply(res,errorCode(e)==="23505"?409:500,{error:"quote_create_failed"});}
  return true;
 }

 if(req.method==="POST"&&contractCollection){
  const body=await readJson(req);if(!body){reply(res,400,{error:"invalid_json_or_body_too_large"});return true;}
  const invalid=validateContractInput(body);if(invalid){reply(res,422,{error:invalid});return true;}
  try{
   const scoped=await withAdmin(pool,userId,async c=>{
    const quote=await c.query<{id:string;customer_id:string;status:string}>("SELECT id,customer_id,status FROM platform.quotes WHERE id=$1::uuid FOR UPDATE",[body.quoteId]);
    if(!quote.rows[0])return{notFound:true as const,item:null};
    if(!["approved","accepted"].includes(quote.rows[0].status))return{invalidState:true as const,item:null};
    const existing=await c.query("SELECT id FROM platform.contracts WHERE quote_id=$1::uuid",[body.quoteId]);
    if(existing.rows[0])return{duplicate:true as const,item:null};
    const contractNumber=numberId("CT");
    const result=await c.query(`INSERT INTO platform.contracts(contract_number,customer_id,quote_id,status,starts_on,ends_on,renewal_mode,created_by) VALUES($1,$2::uuid,$3::uuid,'draft',$4::date,$5::date,$6,$7::uuid) RETURNING id,contract_number AS "contractNumber",customer_id AS "customerId",quote_id AS "quoteId",status,starts_on AS "startsOn",ends_on AS "endsOn",renewal_mode AS "renewalMode",created_at AS "createdAt"`,[contractNumber,quote.rows[0].customer_id,body.quoteId,body.startsOn??null,body.endsOn??null,body.renewalMode??"manual",userId]);
    const row=result.rows[0] as {id:string}|undefined;if(!row)throw new Error("contract_insert_failed");
    await audit(c,userId,"commercial.contract.created","contract",row.id,{quoteId:body.quoteId,renewalMode:body.renewalMode??"manual"});
    return{notFound:false as const,invalidState:false as const,duplicate:false as const,item:result.rows[0]};
   });
   if(scoped.forbidden){reply(res,403,{error:"platform_super_admin_required"});return true;}
   if(scoped.value && "notFound" in scoped.value && scoped.value.notFound){reply(res,404,{error:"quote_not_found"});return true;}
   if(scoped.value && "invalidState" in scoped.value && scoped.value.invalidState){reply(res,409,{error:"quote_must_be_approved_before_contract"});return true;}
   if(scoped.value && "duplicate" in scoped.value && scoped.value.duplicate){reply(res,409,{error:"contract_already_exists_for_quote"});return true;}
   reply(res,201,{data:scoped.value?.item});
  }catch(e){reply(res,500,{error:"contract_create_failed"});}
  return true;
 }

 if(req.method==="PATCH"&&quoteAction){
  try{
   const scoped=await withAdmin(pool,userId,async c=>{
    const q=await c.query<{id:string;status:string;created_by:string;discount_total:string}>("SELECT id,status,created_by,discount_total FROM platform.quotes WHERE id=$1::uuid FOR UPDATE",[quoteId]);
    if(!q.rows[0])return{notFound:true as const,invalidState:false as const,selfApproval:false as const};
    const quote=q.rows[0];
    if(quoteVerb==="submit"){
     if(quote.status!=="draft")return{notFound:false as const,invalidState:true as const,selfApproval:false as const};
     await c.query("UPDATE platform.quotes SET status='submitted',updated_at=now() WHERE id=$1::uuid",[quoteId]);
     await c.query("INSERT INTO platform.approval_requests(request_type,resource_type,resource_id,status,requested_by) VALUES($1,'quote',$2::uuid,'pending',$3::uuid)",[Number(quote.discount_total)>0?"quote_discount":"other",quoteId,userId]);
     await audit(c,userId,"commercial.quote.submitted","quote",quoteId!,{});
     return{notFound:false as const,invalidState:false as const,selfApproval:false as const};
    }
    if(quoteVerb==="approve"||quoteVerb==="reject"){
     if(quote.status!=="submitted")return{notFound:false as const,invalidState:true as const,selfApproval:false as const};
     if(quote.created_by===userId)return{notFound:false as const,invalidState:false as const,selfApproval:true as const};
     const approval=await c.query<{id:string}>("SELECT id FROM platform.approval_requests WHERE resource_type='quote' AND resource_id=$1::uuid AND status='pending' ORDER BY created_at DESC LIMIT 1",[quoteId]);
     if(!approval.rows[0])return{notFound:false as const,invalidState:true as const,selfApproval:false as const};
     const status=quoteVerb==="approve"?"approved":"rejected";
     await c.query("UPDATE platform.approval_requests SET status=$2,decided_by=$3::uuid,decided_at=now(),decision_note=$4 WHERE id=$1::uuid",[approval.rows[0].id,status,userId,quoteVerb==="approve"?"Approved by platform admin":"Rejected by platform admin"]);
     await c.query("UPDATE platform.quotes SET status=$2,approved_by=CASE WHEN $2='approved' THEN $3::uuid ELSE approved_by END,approved_at=CASE WHEN $2='approved' THEN now() ELSE approved_at END,updated_at=now() WHERE id=$1::uuid",[quoteId,status,userId]);
     await audit(c,userId,`commercial.quote.${quoteVerb==="approve"?"approved":"rejected"}`,"quote",quoteId!,{});
     return{notFound:false as const,invalidState:false as const,selfApproval:false as const};
    }
    return{notFound:false as const,invalidState:true as const,selfApproval:false as const};
   });
   if(scoped.forbidden){reply(res,403,{error:"platform_super_admin_required"});return true;}
   if(scoped.value?.notFound){reply(res,404,{error:"quote_not_found"});return true;}
   if(scoped.value?.selfApproval){reply(res,403,{error:"requester_cannot_approve_own_quote"});return true;}
   if(scoped.value?.invalidState){reply(res,409,{error:"quote_transition_not_allowed"});return true;}
   reply(res,200,{data:{id:quoteId,status:quoteVerb==="submit"?"submitted":quoteVerb==="approve"?"approved":"rejected"}});
  }catch(e){reply(res,500,{error:"quote_transition_failed"});}
  return true;
 }

 if(req.method==="PATCH"&&contractAction){
  try{
   const scoped=await withAdmin(pool,userId,async c=>{
    const q=await c.query<{id:string;status:string;created_by:string}>("SELECT id,status,created_by FROM platform.contracts WHERE id=$1::uuid FOR UPDATE",[contractId]);
    if(!q.rows[0])return{notFound:true as const,invalidState:false as const,selfApproval:false as const};
    const contract=q.rows[0];
    if(contractVerb==="submit"){
     if(contract.status!=="draft")return{notFound:false as const,invalidState:true as const,selfApproval:false as const};
     await c.query("UPDATE platform.contracts SET status='review',updated_at=now() WHERE id=$1::uuid",[contractId]);
     await c.query("INSERT INTO platform.approval_requests(request_type,resource_type,resource_id,status,requested_by) VALUES('contract_activation','contract',$1::uuid,'pending',$2::uuid)",[contractId,userId]);
     await audit(c,userId,"commercial.contract.submitted","contract",contractId!,{});
     return{notFound:false as const,invalidState:false as const,selfApproval:false as const};
    }
    if(contractVerb==="approve"||contractVerb==="reject"){
     if(contract.status!=="review")return{notFound:false as const,invalidState:true as const,selfApproval:false as const};
     if(contract.created_by===userId)return{notFound:false as const,invalidState:false as const,selfApproval:true as const};
     const approval=await c.query<{id:string}>("SELECT id FROM platform.approval_requests WHERE resource_type='contract' AND resource_id=$1::uuid AND status='pending' ORDER BY created_at DESC LIMIT 1",[contractId]);
     if(!approval.rows[0])return{notFound:false as const,invalidState:true as const,selfApproval:false as const};
     const status=contractVerb==="approve"?"approved":"rejected";
     await c.query("UPDATE platform.approval_requests SET status=$2,decided_by=$3::uuid,decided_at=now(),decision_note=$4 WHERE id=$1::uuid",[approval.rows[0].id,status,userId,contractVerb==="approve"?"Approved by platform admin":"Rejected by platform admin"]);
     await c.query("UPDATE platform.contracts SET status=CASE WHEN $2='approved' THEN 'active' ELSE 'cancelled' END,approved_by=CASE WHEN $2='approved' THEN $3::uuid ELSE approved_by END,approved_at=CASE WHEN $2='approved' THEN now() ELSE approved_at END,updated_at=now() WHERE id=$1::uuid",[contractId,status,userId]);
     await audit(c,userId,`commercial.contract.${contractVerb==="approve"?"approved":"rejected"}`,"contract",contractId!,{});
     return{notFound:false as const,invalidState:false as const,selfApproval:false as const};
    }
    return{notFound:false as const,invalidState:true as const,selfApproval:false as const};
   });
   if(scoped.forbidden){reply(res,403,{error:"platform_super_admin_required"});return true;}
   if(scoped.value?.notFound){reply(res,404,{error:"contract_not_found"});return true;}
   if(scoped.value?.selfApproval){reply(res,403,{error:"requester_cannot_approve_own_contract"});return true;}
   if(scoped.value?.invalidState){reply(res,409,{error:"contract_transition_not_allowed"});return true;}
   reply(res,200,{data:{id:contractId,status:contractVerb==="submit"?"review":contractVerb==="approve"?"active":"cancelled"}});
  }catch(e){reply(res,500,{error:"contract_transition_failed"});}
  return true;
 }
 reply(res,405,{error:"method_not_allowed"});return true;
}
