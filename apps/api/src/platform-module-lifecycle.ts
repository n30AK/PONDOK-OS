import { randomUUID } from "node:crypto";
import type { IncomingMessage,ServerResponse } from "node:http";
import type { TenantDatabase } from "./tenant-db.js";
type Json=Record<string,unknown>;
type Client={query<T=unknown>(sql:string,values?:unknown[]):Promise<{rows:T[]}>;release():void};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BILLING=["one_time","recurring","included","complimentary","trial"] as const;
const ACTIONS=["add","activate","upgrade","downgrade","renew","suspend","resume","remove"] as const;
const MODULES=[
 ["executive_dashboard","Executive Dashboard","KPI eksekutif, pendapatan, pelanggan, arus kas, risiko, dan laporan.", "foundation"],
 ["crm_sales","CRM & Sales","Prospek, pipeline, kontak, aktivitas sales, penawaran, dan Customer 360.","foundation"],
 ["customer_management","Customer Management","Profil pelanggan, kontrak, cabang, paket layanan, trial, subscription, dan renewal.","foundation"],
 ["billing_invoice","Billing & Invoice","Invoice, penagihan berulang, kuitansi, alokasi pembayaran, piutang, dan credit note.","foundation"],
 ["accounting_finance","Accounting & Finance","Chart of Accounts, jurnal, buku besar, neraca saldo, laporan keuangan, dan tutup buku.","foundation"],
 ["procurement","Procurement","Vendor, PR, RFQ, perbandingan penawaran, PO, penerimaan barang, dan pembayaran vendor.","planned"],
 ["inventory_asset","Inventory & Asset","Gudang, stok, mutasi, stok opname, barcode, aset tetap, dan penyusutan.","planned"],
 ["hrd_payroll","HRD & Payroll","Pegawai, rekrutmen, absensi, cuti, lembur, BPJS, PPh 21, payroll, dan slip gaji.","planned"],
 ["support_customer_success","Support & Customer Success","Tiket, SLA, eskalasi, insiden, knowledge base, dan retensi pelanggan.","foundation"],
 ["internal_operations","Internal Operations","Departemen, anggaran internal, kebijakan, pengeluaran, aset, dan administrasi.","planned"],
 ["document_center","Document Center","Dokumen invoice, kontrak, proposal, PO, kuitansi, slip gaji, dan arsip.","planned"],
 ["fleet_management","Fleet Management","Instalasi klien, heartbeat, versi aplikasi, konektor, kesehatan sistem, dan remote support.","foundation"],
 ["multi_agent_ai","Multi-Agent AI","Orkestrasi agent, monitoring, diagnosis, rekomendasi, approval, dan otomasi.","foundation"],
 ["governance_compliance","Governance & Compliance","Hak akses, MFA, audit, isolasi tenant, keamanan, retensi, dan disaster recovery.","foundation"]
] as const;
function reply(res:ServerResponse,status:number,body:unknown){res.writeHead(status,{"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff","referrer-policy":"no-referrer"});res.end(JSON.stringify(body));}
function isRecord(v:unknown):v is Json{return typeof v==="object"&&v!==null&&!Array.isArray(v);}
async function readJson(req:IncomingMessage):Promise<Json|null>{const chunks:Buffer[]=[];let size=0;for await(const chunk of req){const p=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);size+=p.length;if(size>32768)return null;chunks.push(p);}try{const x:unknown=JSON.parse(Buffer.concat(chunks).toString("utf8"));return isRecord(x)?x:null;}catch{return null;}}
function cents(v:unknown):number|null{if(typeof v!=="number"||!Number.isFinite(v)||v<0||v>1_000_000_000_000)return null;const n=v*100;if(Math.abs(n-Math.round(n))>1e-7)return null;return Math.round(n);}
function quantityMilli(v:unknown):number|null{if(typeof v!=="number"||!Number.isFinite(v)||v<=0||v>1_000_000)return null;const n=v*1000;if(Math.abs(n-Math.round(n))>1e-7)return null;return Math.round(n);}
function money(v:number){return(v/100).toFixed(2);}
function businessDate(){const p=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Jakarta",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());const y=p.find(x=>x.type==="year")?.value,m=p.find(x=>x.type==="month")?.value,d=p.find(x=>x.type==="day")?.value;if(!y||!m||!d)throw new Error("business_date_unavailable");return y+"-"+m+"-"+d;}
function numberId(prefix:string){return prefix+"-"+businessDate().replace(/-/g,"")+"-"+randomUUID().slice(0,8).toUpperCase();}
function validDate(v:unknown){if(typeof v!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(v))return false;const p=v.split("-");if(p.length!==3)return false;const y=Number(p[0]),m=Number(p[1]),d=Number(p[2]);if(!Number.isInteger(y)||!Number.isInteger(m)||!Number.isInteger(d))return false;const x=new Date(Date.UTC(y,m-1,d));return x.getUTCFullYear()===y&&x.getUTCMonth()===m-1&&x.getUTCDate()===d;}
async function withAdmin<T>(pool:TenantDatabase,userId:string,work:(c:Client)=>Promise<T>):Promise<{forbidden:boolean;value?:T}>{if(!pool.connect)throw new Error("platform_transaction_unavailable");const c=await pool.connect() as Client;let active=false;try{await c.query("BEGIN");active=true;const auth=await c.query<{allowed:boolean}>("SELECT EXISTS(SELECT 1 FROM platform.super_admins WHERE user_id=$1::uuid AND status='active') AS allowed",[userId]);if(auth.rows[0]?.allowed!==true){await c.query("ROLLBACK");active=false;return{forbidden:true};}await c.query("SELECT set_config('app.user_id',$1,true)",[userId]);await c.query("SET LOCAL ROLE pondok_platform_runtime");const value=await work(c);await c.query("COMMIT");active=false;return{forbidden:false,value};}catch(e){if(active)await c.query("ROLLBACK").catch(()=>undefined);throw e;}finally{c.release();}}
async function audit(c:Client,userId:string,action:string,type:string,id:string,metadata:Json={}){await c.query("INSERT INTO platform.audit_events(actor_user_id,action,resource_type,resource_id,metadata) VALUES($1::uuid,$2,$3,$4::uuid,$5::jsonb)",[userId,action,type,id,JSON.stringify(metadata)]);}
async function lifecycle(c:Client,order:{id:string;customer_id:string;installation_id:string;module_id:string},event:string,userId:string,payload:Json={}){await c.query("INSERT INTO platform.module_lifecycle_events(order_id,customer_id,installation_id,module_id,event_type,actor_type,actor_reference,event_payload_redacted) VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5,'staff',$6,$7::jsonb)",[order.id,order.customer_id,order.installation_id,order.module_id,event,userId,JSON.stringify(payload)]);}
function errorCode(e:unknown){return typeof e==="object"&&e!==null&&"code"in e?String((e as {code:unknown}).code):"";}
function idempotency(req:IncomingMessage,body:Json){const h=req.headers["idempotency-key"];const value=Array.isArray(h)?h[0]:h;const key=typeof value==="string"?value:body.idempotencyKey;return typeof key==="string"&&/^[A-Za-z0-9._:-]{8,128}$/.test(key)?key:null;}
export function validateModuleOrder(v:Json):string|null{
 for(const k of ["customerId","installationId","moduleId","contractId"])if(typeof v[k]!=="string"||!UUID.test(String(v[k])))return "invalid_"+k.replace(/[A-Z]/g,x=>"_"+x.toLowerCase());
 if(v.action!==undefined&&!ACTIONS.includes(v.action as typeof ACTIONS[number]))return "invalid_order_action";
 if(v.billingMode!==undefined&&!BILLING.includes(v.billingMode as typeof BILLING[number]))return "invalid_billing_mode";
 if(quantityMilli(v.quantity??1)===null)return "invalid_quantity";
 if(cents(v.discountAmount??0)===null)return "invalid_discount_amount";
 if(cents(v.taxAmount??0)===null)return "invalid_tax_amount";
 if(v.currency!==undefined&&(typeof v.currency!=="string"||!/^[A-Z]{3}$/.test(v.currency)))return "invalid_currency";
 if(v.billingPeriodStart!==undefined&&v.billingPeriodStart!==null&&!validDate(v.billingPeriodStart))return "invalid_billing_period_start";
 if(v.billingPeriodEnd!==undefined&&v.billingPeriodEnd!==null&&!validDate(v.billingPeriodEnd))return "invalid_billing_period_end";
 if(v.billingPeriodStart&&v.billingPeriodEnd&&String(v.billingPeriodEnd)<String(v.billingPeriodStart))return "invalid_billing_period_range";
 if(v.notes!==undefined&&v.notes!==null&&(typeof v.notes!=="string"||v.notes.length>2000))return "invalid_notes";
 return null;
}

export async function handlePlatformModuleLifecycleRequest(req:IncomingMessage,res:ServerResponse,pool:TenantDatabase,userId:string):Promise<boolean>{
 const url=new URL(req.url??"/","http://localhost"),path=url.pathname;
 const catalogPath=path==="/v1/platform/erp/module-catalog",seedCatalogPath=path==="/v1/platform/erp/module-catalog/seed-defaults";
 const catalogAction=path.match(/^\/v1\/platform\/erp\/module-catalog\/([0-9a-f-]{36})\/(request-release|approve-release|reject-release)$/i);
 const ordersPath=path==="/v1/platform/erp/module-orders",orderAction=path.match(/^\/v1\/platform\/erp\/module-orders\/([0-9a-f-]{36})\/(approve|reject|create-invoice|provision)$/i);
 const entitlementsPath=path==="/v1/platform/erp/module-entitlements",entitlementAction=path.match(/^\/v1\/platform\/erp\/module-entitlements\/([0-9a-f-]{36})\/enable$/i);
 if(!catalogPath&&!seedCatalogPath&&!catalogAction&&!ordersPath&&!orderAction&&!entitlementsPath&&!entitlementAction)return false;
 const catalogId=catalogAction?.[1],catalogVerb=catalogAction?.[2]?.toLowerCase(),orderId=orderAction?.[1],orderVerb=orderAction?.[2]?.toLowerCase(),entitlementId=entitlementAction?.[1];
 if([catalogId,orderId,entitlementId].some(x=>x!==undefined&&!UUID.test(x!))){reply(res,400,{error:"invalid_resource_id"});return true;}

 if(req.method==="GET"){
  try{
   const scoped=await withAdmin(pool,userId,async c=>{
    if(catalogPath){const r=await c.query(`SELECT id,module_key AS "moduleKey",display_name AS "displayName",description,current_version AS "currentVersion",lifecycle_status AS "lifecycleStatus",manifest,created_at AS "createdAt" FROM platform.module_catalog ORDER BY display_name`);return{items:r.rows,returned:r.rows.length};}
    if(ordersPath){const r=await c.query(`SELECT o.id,o.order_number AS "orderNumber",o.customer_id AS "customerId",cu.display_name AS "customerName",o.installation_id AS "installationId",i.display_name AS "installationName",o.module_id AS "moduleId",m.display_name AS "moduleName",o.action,o.billing_mode AS "billingMode",o.quantity,o.unit_price AS "unitPrice",o.discount_amount AS "discountAmount",o.tax_amount AS "taxAmount",o.billing_status AS "billingStatus",o.activation_status AS "activationStatus",o.invoice_id AS "invoiceId",o.entitlement_id AS "entitlementId",o.subscription_id AS "subscriptionId",o.created_at AS "createdAt" FROM platform.module_orders o JOIN platform.customers cu ON cu.id=o.customer_id JOIN platform.installations i ON i.id=o.installation_id JOIN platform.module_catalog m ON m.id=o.module_id ORDER BY o.created_at DESC LIMIT 100`);return{items:r.rows,returned:r.rows.length};}
    if(entitlementsPath){const r=await c.query(`SELECT e.id,e.customer_id AS "customerId",cu.display_name AS "customerName",e.installation_id AS "installationId",i.display_name AS "installationName",e.module_id AS "moduleId",m.display_name AS "moduleName",e.status,e.billing_mode AS "billingMode",e.order_id AS "orderId",e.source_contract_id AS "sourceContractId",e.granted_at AS "grantedAt",e.expires_at AS "expiresAt",e.last_change_at AS "lastChangeAt" FROM platform.module_entitlements e JOIN platform.customers cu ON cu.id=e.customer_id JOIN platform.installations i ON i.id=e.installation_id JOIN platform.module_catalog m ON m.id=e.module_id ORDER BY e.created_at DESC LIMIT 100`);return{items:r.rows,returned:r.rows.length};}
    return null;
   });
   if(scoped.forbidden){reply(res,403,{error:"platform_super_admin_required"});return true;}
   reply(res,200,{data:scoped.value});
  }catch{reply(res,500,{error:"platform_module_lifecycle_read_failed"});}
  return true;
 }

 if(req.method==="POST"&&seedCatalogPath){
  try{
   const scoped=await withAdmin(pool,userId,async c=>{
    const created=[];
    for(const [key,name,description,status] of MODULES){
     const m=await c.query<{id:string}>(`INSERT INTO platform.module_catalog(module_key,display_name,description,current_version,lifecycle_status,manifest) VALUES($1,$2,$3,'1.0.0',$4,'{}'::jsonb) ON CONFLICT(module_key) DO UPDATE SET module_key=EXCLUDED.module_key RETURNING id`,[key,name,description,status]);
     const module=m.rows[0];if(!module)throw new Error("module_seed_failed");
     const productCode="MOD-"+key.toUpperCase();
     await c.query(`INSERT INTO platform.product_catalog(product_code,product_name,description,product_type,base_price,currency,billing_interval,is_active) VALUES($1,$2,$3,'module',0,'IDR','monthly',false) ON CONFLICT(product_code) DO NOTHING`,[productCode,name,description]);
     created.push({id:module.id,moduleKey:key,displayName:name,lifecycleStatus:status,productCode});
    }
    await audit(c,userId,"module_catalog.defaults_seeded","module_catalog",created[0]!.id,{count:created.length});
    return{items:created,returned:created.length};
   });
   if(scoped.forbidden){reply(res,403,{error:"platform_super_admin_required"});return true;}
   reply(res,200,{data:scoped.value});
  }catch{reply(res,500,{error:"module_catalog_seed_failed"});}
  return true;
 }

 if(req.method==="PATCH"&&catalogAction){
  try{
   const scoped=await withAdmin(pool,userId,async c=>{
    const module=await c.query<{id:string;module_key:string;lifecycle_status:string}>("SELECT id,module_key,lifecycle_status FROM platform.module_catalog WHERE id=$1::uuid FOR UPDATE",[catalogId]);
    if(!module.rows[0])return{notFound:true as const,invalidState:false as const,selfApproval:false as const};
    if(catalogVerb==="request-release"){
     if(!["foundation","planned"].includes(module.rows[0].lifecycle_status))return{notFound:false as const,invalidState:true as const,selfApproval:false as const};
     const pending=await c.query("SELECT id FROM platform.approval_requests WHERE resource_type='module_catalog' AND resource_id=$1::uuid AND status='pending' LIMIT 1",[catalogId]);
     if(pending.rows[0])return{notFound:false as const,invalidState:true as const,selfApproval:false as const};
     const approval=await c.query<{id:string}>(`INSERT INTO platform.approval_requests(request_type,resource_type,resource_id,status,requested_by) VALUES('module_release','module_catalog',$1::uuid,'pending',$2::uuid) RETURNING id`,[catalogId,userId]);
     await audit(c,userId,"module_catalog.release_requested","module_catalog",catalogId!,{moduleKey:module.rows[0].module_key});
     return{notFound:false as const,invalidState:false as const,selfApproval:false as const,approvalId:approval.rows[0]?.id};
    }
    const approval=await c.query<{id:string;requested_by:string}>("SELECT id,requested_by FROM platform.approval_requests WHERE resource_type='module_catalog' AND resource_id=$1::uuid AND request_type='module_release' AND status='pending' ORDER BY created_at DESC LIMIT 1 FOR UPDATE",[catalogId]);
    if(!approval.rows[0])return{notFound:false as const,invalidState:true as const,selfApproval:false as const};
    if(approval.rows[0].requested_by===userId)return{notFound:false as const,invalidState:false as const,selfApproval:true as const};
    const status=catalogVerb==="approve-release"?"approved":"rejected";
    await c.query("UPDATE platform.approval_requests SET status=$2,decided_by=$3::uuid,decided_at=now(),decision_note=$4 WHERE id=$1::uuid",[approval.rows[0].id,status,userId,status==="approved"?"Module release approved":"Module release rejected"]);
    if(status==="approved"){
     await c.query("UPDATE platform.module_catalog SET lifecycle_status='operational',updated_at=now() WHERE id=$1::uuid",[catalogId]);
     await c.query("UPDATE platform.product_catalog SET is_active=true,updated_at=now() WHERE product_code=$1",[ "MOD-"+module.rows[0].module_key.toUpperCase()]);
    }
    await audit(c,userId,status==="approved"?"module_catalog.release_approved":"module_catalog.release_rejected","module_catalog",catalogId!,{moduleKey:module.rows[0].module_key});
    return{notFound:false as const,invalidState:false as const,selfApproval:false as const,status};
   });
   if(scoped.forbidden){reply(res,403,{error:"platform_super_admin_required"});return true;}
   if(scoped.value?.notFound){reply(res,404,{error:"module_not_found"});return true;}
   if(scoped.value?.selfApproval){reply(res,403,{error:"release_requester_cannot_approve_own_release"});return true;}
   if(scoped.value?.invalidState){reply(res,409,{error:"module_release_transition_not_allowed"});return true;}
   reply(res,200,{data:{id:catalogId,status:catalogVerb==="request-release"?"pending":scoped.value?.status??"pending"}});
  }catch{reply(res,500,{error:"module_release_transition_failed"});}
  return true;
 }

 if(req.method==="POST"&&ordersPath){
  const body=await readJson(req);if(!body){reply(res,400,{error:"invalid_json_or_body_too_large"});return true;}
  const invalid=validateModuleOrder(body);if(invalid){reply(res,422,{error:invalid});return true;}
  const key=idempotency(req,body);if(!key){reply(res,422,{error:"idempotency_key_required"});return true;}
  const billingMode=(body.billingMode??"one_time") as typeof BILLING[number],action=(body.action??"add") as typeof ACTIONS[number];
  try{
   const scoped=await withAdmin(pool,userId,async c=>{
    const existing=await c.query<{id:string;customer_id:string;installation_id:string;module_id:string;action:string}>("SELECT id,customer_id,installation_id,module_id,action FROM platform.module_orders WHERE idempotency_key=$1",[key]);
    if(existing.rows[0]){
     const x=existing.rows[0];if(x.customer_id!==body.customerId||x.installation_id!==body.installationId||x.module_id!==body.moduleId||x.action!==action)return{conflict:true as const,item:null};
     return{conflict:false as const,item:{id:x.id,replayed:true}};
    }
    const installation=await c.query("SELECT id FROM platform.installations WHERE id=$1::uuid AND customer_id=$2::uuid AND status<>'revoked'",[body.installationId,body.customerId]);
    if(!installation.rows[0])return{invalidInstallation:true as const,notFound:false as const,notReady:false as const,item:null};
    const module=await c.query<{id:string;module_key:string;display_name:string;lifecycle_status:string}>("SELECT id,module_key,display_name,lifecycle_status FROM platform.module_catalog WHERE id=$1::uuid",[body.moduleId]);
    if(!module.rows[0])return{invalidInstallation:false as const,notFound:true as const,notReady:false as const,item:null};
    if(!["operational","verified"].includes(module.rows[0].lifecycle_status))return{invalidInstallation:false as const,notFound:false as const,notReady:true as const,item:null};
    const contract=await c.query("SELECT id FROM platform.contracts WHERE id=$1::uuid AND customer_id=$2::uuid AND status='active'",[body.contractId,body.customerId]);
    if(!contract.rows[0])return{invalidInstallation:false as const,notFound:false as const,notReady:false as const,invalidContract:true as const,item:null};
    const product=await c.query<{id:string;base_price:string;currency:string;is_active:boolean}>("SELECT id,base_price,currency,is_active FROM platform.product_catalog WHERE product_code=$1",[ "MOD-"+module.rows[0].module_key.toUpperCase()]);
    if(!product.rows[0]||!product.rows[0].is_active)return{invalidInstallation:false as const,notFound:false as const,notReady:false as const,invalidContract:false as const,productMissing:true as const,item:null};
    const qty=quantityMilli(body.quantity??1)!,price=cents(Number(product.rows[0].base_price))!,discount=cents(body.discountAmount??0)!,tax=cents(body.taxAmount??0)!;
    const gross=Number((BigInt(qty)*BigInt(price)+500n)/1000n);
    if(billingMode!=="included"&&billingMode!=="complimentary"&&billingMode!=="trial"&&gross<=0)return{invalidInstallation:false as const,notFound:false as const,notReady:false as const,invalidContract:false as const,productMissing:false as const,invalidPrice:true as const,item:null};
    if(discount>gross||gross-discount+tax>1_000_000_000_000)return{invalidInstallation:false as const,notFound:false as const,notReady:false as const,invalidContract:false as const,productMissing:false as const,invalidPrice:true as const,item:null};
    if(billingMode==="recurring"||billingMode==="trial"){
     if(!Number.isInteger(qty/1000)||!body.billingPeriodStart||!body.billingPeriodEnd)return{invalidInstallation:false as const,notFound:false as const,notReady:false as const,invalidContract:false as const,productMissing:false as const,invalidPrice:false as const,invalidPeriod:true as const,item:null};
    }
    const orderNumber=numberId("MO"),billable=["one_time","recurring"].includes(billingMode),billingStatus=billable?"pending_approval":"not_billable";
    const result=await c.query<{id:string}>(`INSERT INTO platform.module_orders(order_number,idempotency_key,customer_id,installation_id,module_id,contract_id,action,requested_version,billing_mode,quantity,unit_price,discount_amount,tax_amount,currency,billing_period_start,billing_period_end,billing_status,activation_status,requested_by,notes) VALUES($1,$2,$3::uuid,$4::uuid,$5::uuid,$6::uuid,$7,$8,$9,$10::numeric,$11::numeric,$12::numeric,$13::numeric,$14,$15::date,$16::date,$17,'pending_approval',$18::uuid,$19) RETURNING id`,[orderNumber,key,body.customerId,body.installationId,body.moduleId,body.contractId,action,body.requestedVersion??null,billingMode,(qty/1000).toFixed(3),money(price),money(discount),money(tax),body.currency??product.rows[0].currency,body.billingPeriodStart??null,body.billingPeriodEnd??null,billingStatus,userId,body.notes??null]);
    const order=result.rows[0];if(!order)throw new Error("module_order_insert_failed");
    const approval=await c.query<{id:string}>(`INSERT INTO platform.approval_requests(request_type,resource_type,resource_id,status,requested_by) VALUES('other','module_order',$1::uuid,'pending',$2::uuid) RETURNING id`,[order.id,userId]);
    await c.query("UPDATE platform.module_orders SET approval_request_id=$2::uuid WHERE id=$1::uuid",[order.id,approval.rows[0]?.id]);
    const ref={id:order.id,customer_id:String(body.customerId),installation_id:String(body.installationId),module_id:String(body.moduleId)};
    await lifecycle(c,userId?{...ref}:ref,"requested",userId,{billingMode,action});
    await audit(c,userId,"module_order.requested","module_order",order.id,{orderNumber,moduleKey:module.rows[0].module_key,billingMode,action});
    return{conflict:false as const,item:{id:order.id,orderNumber,replayed:false}};
   });
   if(scoped.forbidden){reply(res,403,{error:"platform_super_admin_required"});return true;}
   if(scoped.value?.conflict){reply(res,409,{error:"idempotency_key_conflict"});return true;}
   if(scoped.value?.invalidInstallation){reply(res,404,{error:"installation_not_found_for_customer"});return true;}
   if(scoped.value?.notFound){reply(res,404,{error:"module_not_found"});return true;}
   if(scoped.value?.notReady){reply(res,409,{error:"module_not_operational"});return true;}
   if("invalidContract"in (scoped.value??{})&&scoped.value?.invalidContract){reply(res,409,{error:"active_customer_contract_required"});return true;}
   if("productMissing"in (scoped.value??{})&&scoped.value?.productMissing){reply(res,409,{error:"module_product_catalog_not_active"});return true;}
   if("invalidPrice"in (scoped.value??{})&&scoped.value?.invalidPrice){reply(res,422,{error:"module_order_price_or_discount_invalid"});return true;}
   if("invalidPeriod"in (scoped.value??{})&&scoped.value?.invalidPeriod){reply(res,422,{error:"recurring_or_trial_period_and_integer_quantity_required"});return true;}
   reply(res,201,{data:scoped.value?.item});
  }catch(e){reply(res,errorCode(e)==="23505"?409:500,{error:"module_order_create_failed"});}
  return true;
 }

 if(req.method==="PATCH"&&orderAction){
  const order=await withAdmin(pool,userId,async c=>{
   const r=await c.query<{id:string;customer_id:string;installation_id:string;module_id:string;contract_id:string|null;billing_mode:string;billing_status:string;activation_status:string;requested_by:string;approved_by:string|null;unit_price:string;quantity:string;discount_amount:string;tax_amount:string;billing_period_start:string|null;billing_period_end:string|null;invoice_id:string|null;entitlement_id:string|null;subscription_id:string|null}>("SELECT id,customer_id,installation_id,module_id,contract_id,billing_mode,billing_status,activation_status,requested_by,approved_by,unit_price,quantity,discount_amount,tax_amount,billing_period_start,billing_period_end,invoice_id,entitlement_id,subscription_id FROM platform.module_orders WHERE id=$1::uuid FOR UPDATE",[orderId]);
   if(!r.rows[0])return{notFound:true as const,invalidState:false as const,selfApproval:false as const,missingHeartbeat:false as const};
   const o=r.rows[0];
   if(orderVerb==="approve"||orderVerb==="reject"){
    if(o.activation_status!=="pending_approval")return{notFound:false as const,invalidState:true as const,selfApproval:false as const,missingHeartbeat:false as const};
    if(o.requested_by===userId)return{notFound:false as const,invalidState:false as const,selfApproval:true as const,missingHeartbeat:false as const};
    const approval=await c.query<{id:string}>("SELECT id FROM platform.approval_requests WHERE id=(SELECT approval_request_id FROM platform.module_orders WHERE id=$1::uuid) AND status='pending' FOR UPDATE",[orderId]);
    if(!approval.rows[0])return{notFound:false as const,invalidState:true as const,selfApproval:false as const,missingHeartbeat:false as const};
    const approved=orderVerb==="approve",newStatus=approved?"approved":"cancelled";
    await c.query("UPDATE platform.approval_requests SET status=$2,decided_by=$3::uuid,decided_at=now(),decision_note=$4 WHERE id=$1::uuid",[approval.rows[0].id,approved?"approved":"rejected",userId,approved?"Module order approved":"Module order rejected"]);
    await c.query("UPDATE platform.module_orders SET activation_status=$2,billing_status=CASE WHEN $2='cancelled' AND billing_status<>'not_billable' THEN 'void' WHEN $2='approved' AND billing_status='pending_approval' THEN 'ready' ELSE billing_status END,approved_by=CASE WHEN $2='approved' THEN $3::uuid ELSE approved_by END,approved_at=CASE WHEN $2='approved' THEN now() ELSE approved_at END,updated_at=now() WHERE id=$1::uuid",[orderId,newStatus,userId]);
    await lifecycle(c,{id:o.id,customer_id:o.customer_id,installation_id:o.installation_id,module_id:o.module_id},approved?"approved":"cancelled",userId,{});
    await audit(c,userId,approved?"module_order.approved":"module_order.rejected","module_order",orderId!,{});
    return{notFound:false as const,invalidState:false as const,selfApproval:false as const,missingHeartbeat:false as const,status:newStatus};
   }
   if(orderVerb==="create-invoice"){
    if(o.activation_status!=="approved"||!["one_time","recurring"].includes(o.billing_mode)||o.billing_status!=="ready"||o.invoice_id)return{notFound:false as const,invalidState:true as const,selfApproval:false as const,missingHeartbeat:false as const};
    const due=await readJson(req);if(!due||!validDate(due.dueOn))return{notFound:false as const,invalidState:true as const,selfApproval:false as const,missingHeartbeat:false as const};
    const module=await c.query<{display_name:string;module_key:string}>("SELECT display_name,module_key FROM platform.module_catalog WHERE id=$1::uuid",[o.module_id]);
    const product=await c.query<{id:string;currency:string}>("SELECT id,currency FROM platform.product_catalog WHERE product_code=$1",["MOD-"+(module.rows[0]?.module_key??"").toUpperCase()]);
    if(!module.rows[0]||!product.rows[0])return{notFound:false as const,invalidState:true as const,selfApproval:false as const,missingHeartbeat:false as const};
    const qty=Math.round(Number(o.quantity)*1000),price=Math.round(Number(o.unit_price)*100),discount=Math.round(Number(o.discount_amount)*100),tax=Math.round(Number(o.tax_amount)*100),gross=Math.round(qty*price/1000),total=gross-discount+tax;
    if(total<=0||discount>gross)return{notFound:false as const,invalidState:true as const,selfApproval:false as const,missingHeartbeat:false as const};
    const invoiceNumber=numberId("INV");
    const inv=await c.query<{id:string}>("INSERT INTO platform.invoices(invoice_number,customer_id,contract_id,status,currency,due_on,subtotal,discount_total,tax_total,grand_total,created_by) VALUES($1,$2::uuid,$3::uuid,'draft',$4,$5::date,$6::numeric,$7::numeric,$8::numeric,$9::numeric,$10::uuid) RETURNING id",[invoiceNumber,o.customer_id,o.contract_id,product.rows[0].currency,due.dueOn,money(gross),money(discount),money(tax),money(total),userId]);
    const invoice=inv.rows[0];if(!invoice)throw new Error("module_invoice_create_failed");
    const line=await c.query<{id:string}>("INSERT INTO platform.invoice_lines(invoice_id,product_id,description,quantity,unit_price,discount_amount,tax_amount,line_total) VALUES($1::uuid,$2::uuid,$3,$4::numeric,$5::numeric,$6::numeric,$7::numeric,$8::numeric) RETURNING id",[invoice.id,product.rows[0].id,module.rows[0].display_name,(qty/1000).toFixed(3),money(price),money(discount),money(tax),money(total)]);
    if(!line.rows[0])throw new Error("module_invoice_line_create_failed");
    await c.query("UPDATE platform.module_orders SET invoice_id=$2::uuid,invoice_line_id=$3::uuid,billing_status='invoiced',updated_at=now() WHERE id=$1::uuid",[orderId,invoice.id,line.rows[0].id]);
    await lifecycle(c,{id:o.id,customer_id:o.customer_id,installation_id:o.installation_id,module_id:o.module_id},"invoice_created",userId,{invoiceNumber});
    await audit(c,userId,"module_order.invoice_created","module_order",orderId!,{invoiceId:invoice.id,invoiceNumber});
    return{notFound:false as const,invalidState:false as const,selfApproval:false as const,missingHeartbeat:false as const,invoiceId:invoice.id};
   }
   if(orderVerb==="provision"){
    if(o.activation_status!=="approved"||(!["not_billable","paid","waived"].includes(o.billing_status)))return{notFound:false as const,invalidState:true as const,selfApproval:false as const,missingHeartbeat:false as const};
    let entitlementId=o.entitlement_id,subscriptionId=o.subscription_id;
    if(!entitlementId){
     const e=await c.query<{id:string}>(`INSERT INTO platform.module_entitlements(customer_id,installation_id,module_id,status,source_contract_id,billing_mode,order_id) VALUES($1::uuid,$2::uuid,$3::uuid,'pending',$4::uuid,$5,$6::uuid) ON CONFLICT(customer_id,installation_id,module_id) DO UPDATE SET order_id=EXCLUDED.order_id,billing_mode=EXCLUDED.billing_mode,source_contract_id=EXCLUDED.source_contract_id RETURNING id`,[o.customer_id,o.installation_id,o.module_id,o.contract_id,o.billing_mode,orderId]);
     entitlementId=e.rows[0]?.id??null;
    }
    if(!entitlementId)throw new Error("module_entitlement_create_failed");
    if(["recurring","trial","included","complimentary"].includes(o.billing_mode)&&!subscriptionId){
     const module=await c.query<{module_key:string}>("SELECT module_key FROM platform.module_catalog WHERE id=$1::uuid",[o.module_id]);
     const product=await c.query<{id:string}>("SELECT id FROM platform.product_catalog WHERE product_code=$1",["MOD-"+(module.rows[0]?.module_key??"").toUpperCase()]);
     if(!product.rows[0])throw new Error("module_subscription_product_missing");
     const start=o.billing_period_start??businessDate(),end=o.billing_period_end;
     const status=o.billing_mode==="trial"?"trial":"active",unitPrice=["included","complimentary","trial"].includes(o.billing_mode)?0:Number(o.unit_price);
     const s=await c.query<{id:string}>(`INSERT INTO platform.subscriptions(customer_id,contract_id,product_id,status,starts_at,ends_at,quantity,unit_price,currency,created_by) VALUES($1::uuid,$2::uuid,$3::uuid,$4,$5::date::timestamptz,$6::date::timestamptz,$7,$8::numeric,'IDR',$9::uuid) RETURNING id`,[o.customer_id,o.contract_id,product.rows[0].id,status,start,end,Math.max(1,Math.round(Number(o.quantity))),unitPrice,userId]);
     subscriptionId=s.rows[0]?.id??null;
    }
    await c.query("UPDATE platform.module_orders SET entitlement_id=$2::uuid,subscription_id=$3::uuid,activation_status='provisioning',updated_at=now() WHERE id=$1::uuid",[orderId,entitlementId,subscriptionId]);
    await lifecycle(c,{id:o.id,customer_id:o.customer_id,installation_id:o.installation_id,module_id:o.module_id},"provision_started",userId,{entitlementId,subscriptionId});
    await audit(c,userId,"module_order.provision_started","module_order",orderId!,{entitlementId,subscriptionId});
    return{notFound:false as const,invalidState:false as const,selfApproval:false as const,missingHeartbeat:false as const,entitlementId,subscriptionId};
   }
   return{notFound:false as const,invalidState:true as const,selfApproval:false as const,missingHeartbeat:false as const};
  });
  if(order.forbidden){reply(res,403,{error:"platform_super_admin_required"});return true;}
  if(order.value?.notFound){reply(res,404,{error:"module_order_not_found"});return true;}
  if(order.value?.selfApproval){reply(res,403,{error:"module_order_requester_cannot_approve"});return true;}
  if(order.value?.invalidState){reply(res,409,{error:"module_order_transition_not_allowed"});return true;}
  reply(res,200,{data:{id:orderId,status:orderVerb==="approve"?"approved":orderVerb==="reject"?"cancelled":orderVerb==="create-invoice"?"invoiced":"provisioning",entitlementId:order.value&&"entitlementId"in order.value?order.value.entitlementId:null,subscriptionId:order.value&&"subscriptionId"in order.value?order.value.subscriptionId:null,invoiceId:order.value&&"invoiceId"in order.value?order.value.invoiceId:null}});
  return true;
 }

 if(req.method==="PATCH"&&entitlementAction){
  const scoped=await withAdmin(pool,userId,async c=>{
   const e=await c.query<{id:string;customer_id:string;installation_id:string;module_id:string;order_id:string|null;status:string}>("SELECT id,customer_id,installation_id,module_id,order_id,status FROM platform.module_entitlements WHERE id=$1::uuid FOR UPDATE",[entitlementId]);
   if(!e.rows[0])return{notFound:true as const,invalidState:false as const,missingHeartbeat:false as const};
   if(e.rows[0].status!=="pending")return{notFound:false as const,invalidState:true as const,missingHeartbeat:false as const};
   const install=await c.query<{status:string;last_heartbeat_at:string|null}>("SELECT status,last_heartbeat_at FROM platform.installations WHERE id=$1::uuid FOR UPDATE",[e.rows[0].installation_id]);
   if(!install.rows[0]||install.rows[0].status!=="online"||!install.rows[0].last_heartbeat_at||Date.now()-Date.parse(install.rows[0].last_heartbeat_at)>15*60*1000)return{notFound:false as const,invalidState:false as const,missingHeartbeat:true as const};
   await c.query("UPDATE platform.module_entitlements SET status='enabled',granted_at=now(),granted_by=$2::uuid,last_change_at=now() WHERE id=$1::uuid",[entitlementId,userId]);
   if(e.rows[0].order_id){await c.query("UPDATE platform.module_orders SET activation_status='active',activated_at=now(),updated_at=now() WHERE id=$1::uuid",[e.rows[0].order_id]);await lifecycle(c,{id:e.rows[0].order_id,customer_id:e.rows[0].customer_id,installation_id:e.rows[0].installation_id,module_id:e.rows[0].module_id},"activated",userId,{entitlementId});}
   await audit(c,userId,"module_entitlement.enabled","module_entitlement",entitlementId!,{installationId:e.rows[0].installation_id});
   return{notFound:false as const,invalidState:false as const,missingHeartbeat:false as const};
  });
  if(scoped.forbidden){reply(res,403,{error:"platform_super_admin_required"});return true;}
  if(scoped.value?.notFound){reply(res,404,{error:"module_entitlement_not_found"});return true;}
  if(scoped.value?.invalidState){reply(res,409,{error:"module_entitlement_not_pending"});return true;}
  if(scoped.value?.missingHeartbeat){reply(res,409,{error:"recent_installation_heartbeat_required"});return true;}
  reply(res,200,{data:{id:entitlementId,status:"enabled"}});
  return true;
 }

 reply(res,405,{error:"method_not_allowed"});return true;
}
