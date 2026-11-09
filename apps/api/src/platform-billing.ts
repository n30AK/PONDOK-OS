import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { TenantDatabase } from "./tenant-db.js";

type Json=Record<string,unknown>;
type Client={query<T=unknown>(sql:string,values?:unknown[]):Promise<{rows:T[]}>;release():void};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PAYMENT_METHODS=["bank_transfer","cash","payment_gateway","other"] as const;
function reply(res:ServerResponse,status:number,body:unknown){res.writeHead(status,{"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff","referrer-policy":"no-referrer"});res.end(JSON.stringify(body));}
function isRecord(v:unknown):v is Json{return typeof v==="object"&&v!==null&&!Array.isArray(v);}
async function readJson(req:IncomingMessage):Promise<Json|null>{
 const chunks:Buffer[]=[];let size=0;for await(const chunk of req){const part=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);size+=part.length;if(size>32768)return null;chunks.push(part);}
 try{const v:unknown=JSON.parse(Buffer.concat(chunks).toString("utf8"));return isRecord(v)?v:null;}catch{return null;}
}
function amountCents(v:unknown):number|null{if(typeof v!=="number"||!Number.isFinite(v)||v<=0||v>1_000_000_000_000)return null;const x=v*100;if(Math.abs(x-Math.round(x))>1e-7)return null;return Math.round(x);}
function money(cents:number){return(cents/100).toFixed(2);}
function validDate(v:unknown){if(typeof v!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(v))return false;const p=v.split("-");if(p.length!==3)return false;const y=Number(p[0]),m=Number(p[1]),d=Number(p[2]);if(!Number.isInteger(y)||!Number.isInteger(m)||!Number.isInteger(d))return false;const x=new Date(Date.UTC(y,m-1,d));return x.getUTCFullYear()===y&&x.getUTCMonth()===m-1&&x.getUTCDate()===d;}
export function validateInvoiceInput(v:Json):string|null{
 if(typeof v.contractId!=="string"||!UUID.test(v.contractId))return "invalid_contract_id";
 if(!validDate(v.dueOn))return "invalid_due_date";
 return null;
}
export function validateSubscriptionInvoiceInput(v:Json):string|null{
 if(Object.keys(v).some(k=>k!=="dueOn"))return "unsupported_subscription_invoice_field";
 if(!validDate(v.dueOn))return "invalid_due_date";
 return null;
}
function addBillingInterval(start:string,interval:string):string{
 const [year,month,day]=start.split("-").map(Number);
 const months=interval==="monthly"?1:interval==="quarterly"?3:interval==="yearly"?12:0;
 if(!months||!year||!month||!day)throw new Error("invalid_billing_interval");
 const targetMonth=month-1+months;
 const targetYear=year+Math.floor(targetMonth/12);
 const normalizedMonth=targetMonth%12;
 const lastDay=new Date(Date.UTC(targetYear,normalizedMonth+1,0)).getUTCDate();
 const next=new Date(Date.UTC(targetYear,normalizedMonth,Math.min(day,lastDay)));
 next.setUTCDate(next.getUTCDate()-1);
 return next.toISOString().slice(0,10);
}
export function validatePaymentInput(v:Json):string|null{
 if(typeof v.invoiceId!=="string"||!UUID.test(v.invoiceId))return "invalid_invoice_id";
 if(amountCents(v.amount)===null)return "invalid_payment_amount";
 if(typeof v.paymentMethod!=="string"||!PAYMENT_METHODS.includes(v.paymentMethod as typeof PAYMENT_METHODS[number]))return "invalid_payment_method";
 if(v.paidAt!==undefined&&v.paidAt!==null&&(typeof v.paidAt!=="string"||!Number.isFinite(Date.parse(v.paidAt))))return "invalid_paid_at";
 if(v.externalReference!==undefined&&v.externalReference!==null&&(typeof v.externalReference!=="string"||v.externalReference.length>180))return "invalid_external_reference";
 return null;
}
async function withAdmin<T>(pool:TenantDatabase,userId:string,work:(c:Client)=>Promise<T>):Promise<{forbidden:boolean;value?:T}>{
 if(!pool.connect)throw new Error("platform_transaction_unavailable");
 const c=await pool.connect() as Client;let active=false;
 try{await c.query("BEGIN");active=true;
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
function businessDate(){const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Jakarta",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());const year=parts.find(x=>x.type==="year")?.value,month=parts.find(x=>x.type==="month")?.value,day=parts.find(x=>x.type==="day")?.value;if(!year||!month||!day)throw new Error("business_date_unavailable");return year+"-"+month+"-"+day;}
function numberId(prefix:string){return prefix+"-"+businessDate().replace(/-/g,"")+"-"+randomUUID().slice(0,8).toUpperCase();}
async function account(c:Client,code:string){const r=await c.query<{id:string}>("SELECT id FROM platform.chart_of_accounts WHERE account_code=$1 AND is_active=true",[code]);return r.rows[0]?.id??null;}
async function postJournal(c:Client,userId:string,args:{entryNumber:string;date:string;description:string;sourceType:"invoice"|"payment";sourceId:string;postingKey:string;debit:number;credit:number;lines:Array<{accountId:string;description:string;debit:number;credit:number;customerId?:string;invoiceId?:string}>}){
 if(args.debit<=0||args.debit!==args.credit||args.lines.length<2)throw new Error("unbalanced_journal_payload");
 const existing=await c.query<{id:string}>("SELECT id FROM platform.journal_entries WHERE posting_key=$1",[args.postingKey]);
 if(existing.rows[0])return existing.rows[0].id;
 const header=await c.query<{id:string}>(`INSERT INTO platform.journal_entries(entry_number,entry_date,description,currency,source_type,source_id,posting_key,status,total_debit,total_credit,posted_by,posted_at) VALUES($1,$2::date,$3,'IDR',$4,$5::uuid,$6,'posted',$7::numeric,$8::numeric,$9::uuid,now()) RETURNING id`,[args.entryNumber,args.date,args.description,args.sourceType,args.sourceId,args.postingKey,money(args.debit),money(args.credit),userId]);
 const id=header.rows[0]?.id;if(!id)throw new Error("journal_header_insert_failed");
 let lineNumber=0;
 for(const line of args.lines){lineNumber++;await c.query(`INSERT INTO platform.journal_lines(journal_entry_id,line_number,account_id,description,debit,credit,customer_id,invoice_id) VALUES($1::uuid,$2,$3::uuid,$4,$5::numeric,$6::numeric,$7::uuid,$8::uuid)`,[id,lineNumber,line.accountId,line.description,money(line.debit),money(line.credit),line.customerId??null,line.invoiceId??null]);}
 return id;
}
const DEFAULT_ACCOUNTS=[
 {code:"1000",name:"Kas",type:"asset",balance:"debit"},
 {code:"1010",name:"Bank",type:"asset",balance:"debit"},
 {code:"1100",name:"Piutang Usaha",type:"asset",balance:"debit"},
 {code:"2100",name:"PPN Keluaran",type:"liability",balance:"credit"},
 {code:"4000",name:"Pendapatan Lisensi dan Layanan",type:"revenue",balance:"credit"}
] as const;

export async function handlePlatformBillingRequest(req:IncomingMessage,res:ServerResponse,pool:TenantDatabase,userId:string):Promise<boolean>{
 const url=new URL(req.url??"/","http://localhost"),path=url.pathname;
 const accountsPath=path==="/v1/platform/erp/accounts";
 const journalsPath=path==="/v1/platform/erp/journals";
 const seedAccountsPath=path==="/v1/platform/erp/accounts/initialize-defaults";
 const invoicesPath=path==="/v1/platform/erp/invoices";
 const invoiceAction=path.match(/^\/v1\/platform\/erp\/invoices\/([0-9a-f-]{36})\/issue$/i);
 const invoiceItem=path.match(/^\/v1\/platform\/erp\/invoices\/([0-9a-f-]{36})$/i);
 const subscriptionInvoiceAction=path.match(/^\/v1\/platform\/erp\/subscriptions\/([0-9a-f-]{36})\/invoices$/i);
 const paymentsPath=path==="/v1/platform/erp/payments";
 const paymentAction=path.match(/^\/v1\/platform\/erp\/payments\/([0-9a-f-]{36})\/(verify|reject)$/i);
 if(!accountsPath&&!journalsPath&&!seedAccountsPath&&!invoicesPath&&!invoiceAction&&!invoiceItem&&!subscriptionInvoiceAction&&!paymentsPath&&!paymentAction)return false;
 const invoiceId=invoiceAction?.[1]??invoiceItem?.[1],subscriptionId=subscriptionInvoiceAction?.[1],paymentId=paymentAction?.[1],paymentVerb=paymentAction?.[2]?.toLowerCase();
 if((invoiceId&&!UUID.test(invoiceId))||(subscriptionId&&!UUID.test(subscriptionId))||(paymentId&&!UUID.test(paymentId))){reply(res,400,{error:"invalid_resource_id"});return true;}

 if(req.method==="GET"){
  try{
   const scoped=await withAdmin(pool,userId,async c=>{
    if(accountsPath){const r=await c.query("SELECT id,account_code AS \"accountCode\",account_name AS \"accountName\",account_type AS \"accountType\",normal_balance AS \"normalBalance\",is_control_account AS \"isControlAccount\",is_active AS \"isActive\" FROM platform.chart_of_accounts ORDER BY account_code");return{items:r.rows,returned:r.rows.length};}
    if(invoicesPath){const r=await c.query(`SELECT i.id,i.invoice_number AS "invoiceNumber",i.customer_id AS "customerId",cu.display_name AS "customerName",i.contract_id AS "contractId",i.status,i.currency,i.issued_on AS "issuedOn",i.due_on AS "dueOn",i.grand_total AS "grandTotal",i.amount_paid AS "amountPaid",i.journal_entry_id AS "journalEntryId",i.created_at AS "createdAt" FROM platform.invoices i JOIN platform.customers cu ON cu.id=i.customer_id ORDER BY i.created_at DESC LIMIT 100`);return{items:r.rows,returned:r.rows.length};}
    if(journalsPath){const r=await c.query(`SELECT j.id,j.entry_number AS "entryNumber",j.entry_date AS "entryDate",j.description,j.source_type AS "sourceType",j.status,j.total_debit AS "totalDebit",j.total_credit AS "totalCredit",j.posting_key AS "postingKey",count(l.id)::int AS "lineCount" FROM platform.journal_entries j LEFT JOIN platform.journal_lines l ON l.journal_entry_id=j.id GROUP BY j.id ORDER BY j.entry_date DESC,j.created_at DESC LIMIT 100`);return{items:r.rows,returned:r.rows.length};}
    if(invoiceItem){const r=await c.query(`SELECT i.id,i.invoice_number AS "invoiceNumber",i.customer_id AS "customerId",cu.display_name AS "customerName",i.contract_id AS "contractId",i.subscription_id AS "subscriptionId",i.status,i.currency,i.issued_on AS "issuedOn",i.due_on AS "dueOn",i.subtotal,i.discount_total AS "discountTotal",i.tax_total AS "taxTotal",i.grand_total AS "grandTotal",i.amount_paid AS "amountPaid",i.journal_entry_id AS "journalEntryId",i.created_at AS "createdAt" FROM platform.invoices i JOIN platform.customers cu ON cu.id=i.customer_id WHERE i.id=$1::uuid`,[invoiceId]);if(!r.rows[0])return{notFound:true as const,item:null};const lines=await c.query(`SELECT id,product_id AS "productId",description,quantity,unit_price AS "unitPrice",discount_amount AS "discountAmount",tax_amount AS "taxAmount",line_total AS "lineTotal" FROM platform.invoice_lines WHERE invoice_id=$1::uuid ORDER BY id`,[invoiceId]);return{notFound:false as const,item:{...(r.rows[0] as Record<string,unknown>),lines:lines.rows}};}
    if(paymentsPath){const r=await c.query(`SELECT p.id,p.payment_reference AS "paymentReference",p.customer_id AS "customerId",cu.display_name AS "customerName",p.invoice_id AS "invoiceId",i.invoice_number AS "invoiceNumber",p.amount,p.currency,p.payment_method AS "paymentMethod",p.status,p.paid_at AS "paidAt",p.verified_at AS "verifiedAt",p.journal_entry_id AS "journalEntryId",p.created_at AS "createdAt" FROM platform.payments p JOIN platform.customers cu ON cu.id=p.customer_id LEFT JOIN platform.invoices i ON i.id=p.invoice_id ORDER BY p.created_at DESC LIMIT 100`);return{items:r.rows,returned:r.rows.length};}
    return null;
   });
   if(scoped.forbidden){reply(res,403,{error:"platform_super_admin_required"});return true;}
   if(!scoped.value){reply(res,404,{error:"resource_not_found"});return true;}
   if("notFound"in scoped.value&&scoped.value.notFound){reply(res,404,{error:"invoice_not_found"});return true;}
   if("item"in scoped.value&&!scoped.value.item){reply(res,404,{error:"invoice_not_found"});return true;}
   reply(res,200,{data:scoped.value});
  }catch(e){reply(res,errorCode(e)==="42P01"?503:500,{error:"platform_billing_read_failed"});}
  return true;
 }

 if(req.method==="POST"&&seedAccountsPath){
  try{
   const scoped=await withAdmin(pool,userId,async c=>{
    const created=[];
    for(const a of DEFAULT_ACCOUNTS){
     await c.query("INSERT INTO platform.chart_of_accounts(account_code,account_name,account_type,normal_balance,is_control_account) VALUES($1,$2,$3,$4,$5) ON CONFLICT(account_code) DO NOTHING",[a.code,a.name,a.type,a.balance,["1100","2100"].includes(a.code)]);
     const found=await c.query<{id:string;account_name:string;account_type:string;normal_balance:string}>("SELECT id,account_name,account_type,normal_balance FROM platform.chart_of_accounts WHERE account_code=$1",[a.code]);
     const row=found.rows[0];if(!row||row.account_name!==a.name||row.account_type!==a.type||row.normal_balance!==a.balance)throw new Error("default_chart_account_conflict");
     created.push({id:row.id,accountCode:a.code,accountName:a.name});
    }
    const first=created[0];if(!first)throw new Error("default_chart_empty");
    await audit(c,userId,"accounting.default_chart.initialized","chart_of_accounts",first.id,{accountCount:created.length});
    return{items:created};
   });
   if(scoped.forbidden){reply(res,403,{error:"platform_super_admin_required"});return true;}
   reply(res,200,{data:scoped.value});
  }catch(e){reply(res,409,{error:errorCode(e)==="23505"?"chart_account_conflict":"default_chart_initialization_failed"});}
  return true;
 }

 if(req.method==="POST"&&invoicesPath){
  const body=await readJson(req);if(!body){reply(res,400,{error:"invalid_json_or_body_too_large"});return true;}
  const invalid=validateInvoiceInput(body);if(invalid){reply(res,422,{error:invalid});return true;}
  try{
   const scoped=await withAdmin(pool,userId,async c=>{
    const contract=await c.query<{id:string;customer_id:string;quote_id:string|null;status:string}>("SELECT id,customer_id,quote_id,status FROM platform.contracts WHERE id=$1::uuid FOR UPDATE",[body.contractId]);
    if(!contract.rows[0])return{notFound:true as const,invalidState:false as const,item:null};
    if(contract.rows[0].status!=="active"||!contract.rows[0].quote_id)return{notFound:false as const,invalidState:true as const,item:null};
    const existingInvoice=await c.query("SELECT id FROM platform.invoices WHERE contract_id=$1::uuid LIMIT 1",[body.contractId]);
    if(existingInvoice.rows[0])return{notFound:false as const,invalidState:false as const,duplicate:true as const,item:null};
    const quote=await c.query<{currency:string;subtotal:string;discount_total:string;tax_total:string;grand_total:string}>("SELECT currency,subtotal,discount_total,tax_total,grand_total FROM platform.quotes WHERE id=$1::uuid",[contract.rows[0].quote_id]);
    if(!quote.rows[0])return{notFound:true as const,invalidState:false as const,item:null};
    const lines=await c.query<{product_id:string|null;description:string;quantity:string;unit_price:string;discount_amount:string;tax_amount:string;line_total:string}>("SELECT product_id,description,quantity,unit_price,discount_amount,tax_amount,line_total FROM platform.quote_lines WHERE quote_id=$1::uuid",[contract.rows[0].quote_id]);
    if(!lines.rows.length)return{notFound:false as const,invalidState:true as const,item:null};
    const invoiceNumber=numberId("INV");
    const result=await c.query(`INSERT INTO platform.invoices(invoice_number,customer_id,contract_id,status,currency,due_on,subtotal,discount_total,tax_total,grand_total,created_by) VALUES($1,$2::uuid,$3::uuid,'draft',$4,$5::date,$6::numeric,$7::numeric,$8::numeric,$9::numeric,$10::uuid) RETURNING id,invoice_number AS "invoiceNumber",customer_id AS "customerId",contract_id AS "contractId",status,currency,due_on AS "dueOn",grand_total AS "grandTotal",created_at AS "createdAt"`,[invoiceNumber,contract.rows[0].customer_id,body.contractId,quote.rows[0].currency,body.dueOn,quote.rows[0].subtotal,quote.rows[0].discount_total,quote.rows[0].tax_total,quote.rows[0].grand_total,userId]);
    const invoice=result.rows[0] as {id:string}|undefined;if(!invoice)throw new Error("invoice_insert_failed");
    for(const line of lines.rows)await c.query("INSERT INTO platform.invoice_lines(invoice_id,product_id,description,quantity,unit_price,discount_amount,tax_amount,line_total) VALUES($1::uuid,$2::uuid,$3,$4::numeric,$5::numeric,$6::numeric,$7::numeric,$8::numeric)",[invoice.id,line.product_id,line.description,line.quantity,line.unit_price,line.discount_amount,line.tax_amount,line.line_total]);
    await audit(c,userId,"billing.invoice.created","invoice",invoice.id,{contractId:body.contractId,lineCount:lines.rows.length});
    return{notFound:false as const,invalidState:false as const,duplicate:false as const,item:result.rows[0]};
   });
   if(scoped.forbidden){reply(res,403,{error:"platform_super_admin_required"});return true;}
   if(scoped.value&&"notFound"in scoped.value&&scoped.value.notFound){reply(res,404,{error:"contract_or_quote_not_found"});return true;}
   if(scoped.value&&"duplicate"in scoped.value&&scoped.value.duplicate){reply(res,409,{error:"invoice_already_exists_for_contract"});return true;}
   if(scoped.value&&"invalidState"in scoped.value&&scoped.value.invalidState){reply(res,409,{error:"active_contract_with_quote_required"});return true;}
   reply(res,201,{data:scoped.value?.item});
  }catch(e){reply(res,errorCode(e)==="23505"?409:500,{error:"invoice_create_failed"});}
  return true;
 }

 if(req.method==="POST"&&subscriptionInvoiceAction){
  const body=await readJson(req);if(!body){reply(res,400,{error:"invalid_json_or_body_too_large"});return true;}
  const invalid=validateSubscriptionInvoiceInput(body);if(invalid){reply(res,422,{error:invalid});return true;}
  if(String(body.dueOn)<businessDate()){reply(res,422,{error:"due_date_cannot_be_in_the_past"});return true;}
  try{
   const scoped=await withAdmin(pool,userId,async c=>{
    const found=await c.query<{
     id:string;customer_id:string;customer_status:string;contract_id:string;contract_status:string;product_id:string;product_name:string;
     status:string;starts_at:string;ends_at:string|null;next_billing_at:string|null;quantity:number;unit_price:string;
     discount_amount:string;tax_amount:string;line_total:string;currency:string;billing_interval:string|null;
     period_start:string;subscription_end_date:string|null;
    }>(
     `SELECT s.id,s.customer_id,cu.status AS customer_status,s.contract_id,k.status AS contract_status,
       s.product_id,p.product_name,s.status,s.starts_at,s.ends_at,s.next_billing_at,s.quantity,
       s.unit_price::text,s.discount_amount::text,s.tax_amount::text,s.line_total::text,s.currency,s.billing_interval,
       to_char(s.next_billing_at AT TIME ZONE 'UTC','YYYY-MM-DD') AS period_start,
       CASE WHEN s.ends_at IS NULL THEN NULL ELSE to_char(s.ends_at AT TIME ZONE 'UTC','YYYY-MM-DD') END AS subscription_end_date
      FROM platform.subscriptions s
      JOIN platform.customers cu ON cu.id=s.customer_id
      LEFT JOIN platform.contracts k ON k.id=s.contract_id
      JOIN platform.product_catalog p ON p.id=s.product_id
      WHERE s.id=$1::uuid FOR UPDATE OF s`,[subscriptionId]);
    const s=found.rows[0];
    if(!s)return{error:"subscription_not_found" as const};
    if(s.status!=="active"||["suspended","former"].includes(s.customer_status)||s.contract_status!=="active")return{error:"active_subscription_and_contract_with_billable_customer_required" as const};
    if(!s.billing_interval||!["monthly","quarterly","yearly"].includes(s.billing_interval))return{error:"recurring_billing_interval_required" as const};
    if(!s.next_billing_at||new Date(s.next_billing_at).getTime()>Date.now())return{error:"subscription_not_due" as const};
    const periodStart=s.period_start;
    const periodEnd=addBillingInterval(periodStart,s.billing_interval);
    if(s.subscription_end_date&&periodEnd>s.subscription_end_date)return{error:"subscription_period_exceeds_end_date_proration_required" as const};
    const dueOn=String(body.dueOn);
    if(dueOn<periodStart)return{error:"due_date_before_billing_period" as const};
    const existing=await c.query<{id:string;invoice_number:string;status:string}>(
     "SELECT id,invoice_number,status FROM platform.invoices WHERE subscription_id=$1::uuid AND billing_period_start=$2::date FOR UPDATE",
     [subscriptionId,periodStart]);
    if(existing.rows[0])return{existing:true as const,item:existing.rows[0]};
    const open=await c.query("SELECT id FROM platform.invoices WHERE subscription_id=$1::uuid AND status IN ('draft','issued','partially_paid','overdue') LIMIT 1 FOR UPDATE",[subscriptionId]);
    if(open.rows[0])return{error:"subscription_has_unpaid_invoice" as const};
    const subtotalCents=Math.round(Number(s.unit_price)*Number(s.quantity)*100);
    const discountCents=Math.round(Number(s.discount_amount)*100);
    const taxCents=Math.round(Number(s.tax_amount)*100);
    const totalCents=Math.round(Number(s.line_total)*100);
    if(!Number.isSafeInteger(subtotalCents)||!Number.isSafeInteger(discountCents)||!Number.isSafeInteger(taxCents)||!Number.isSafeInteger(totalCents)||subtotalCents-discountCents+taxCents!==totalCents||totalCents<=0)
      return{error:"subscription_price_snapshot_invalid" as const};
    const invoiceNumber=numberId("INV");
    const inserted=await c.query(
     `INSERT INTO platform.invoices
       (invoice_number,customer_id,contract_id,subscription_id,status,currency,due_on,billing_period_start,billing_period_end,
        subtotal,discount_total,tax_total,grand_total,created_by)
      VALUES($1,$2::uuid,$3::uuid,$4::uuid,'draft',$5,$6::date,$7::date,$8::date,
       $9::numeric,$10::numeric,$11::numeric,$12::numeric,$13::uuid)
      RETURNING id,invoice_number AS "invoiceNumber",customer_id AS "customerId",contract_id AS "contractId",
       subscription_id AS "subscriptionId",status,currency,due_on AS "dueOn",
       billing_period_start AS "billingPeriodStart",billing_period_end AS "billingPeriodEnd",
       grand_total AS "grandTotal",created_at AS "createdAt"`,
     [invoiceNumber,s.customer_id,s.contract_id,subscriptionId,s.currency,dueOn,periodStart,periodEnd,
      money(subtotalCents),money(discountCents),money(taxCents),money(totalCents),userId]);
    const invoice=inserted.rows[0] as {id:string}|undefined;
    if(!invoice)throw new Error("subscription_invoice_insert_failed");
    await c.query(
     "INSERT INTO platform.invoice_lines(invoice_id,product_id,description,quantity,unit_price,discount_amount,tax_amount,line_total) VALUES($1::uuid,$2::uuid,$3,$4::numeric,$5::numeric,$6::numeric,$7::numeric,$8::numeric)",
     [invoice.id,s.product_id, s.product_name+" ("+periodStart+" – "+periodEnd+")",s.quantity,money(Math.round(Number(s.unit_price)*100)),money(discountCents),money(taxCents),money(totalCents)]);
    await audit(c,userId,"billing.subscription_invoice.created","invoice",invoice.id,{subscriptionId,periodStart,periodEnd});
    return{existing:false as const,item:invoice};
   });
   if(scoped.forbidden){reply(res,403,{error:"platform_super_admin_required"});return true;}
   const value=scoped.value as {error?:string;existing?:boolean;item?:unknown}|undefined;
   if(value?.error){reply(res,value.error==="subscription_not_found"?404:409,{error:value.error});return true;}
   const item=value?.item&&typeof value.item==="object"?{...(value.item as Record<string,unknown>),alreadyExists:value.existing??false}:{alreadyExists:value?.existing??false};
   reply(res,value?.existing?200:201,{data:item});
  }catch(e){const code=errorCode(e);reply(res,code==="23505"?409:code==="42P01"?503:500,{error:code==="23505"?"subscription_invoice_conflict":"subscription_invoice_create_failed"});}
  return true;
 }

 if(req.method==="PATCH"&&invoiceAction){
  try{
   const scoped=await withAdmin(pool,userId,async c=>{
    const invoice=await c.query<{id:string;customer_id:string;status:string;subtotal:string;discount_total:string;tax_total:string;grand_total:string;due_on:string|null}>("SELECT id,customer_id,status,subtotal,discount_total,tax_total,grand_total,due_on FROM platform.invoices WHERE id=$1::uuid FOR UPDATE",[invoiceId]);
    if(!invoice.rows[0])return{notFound:true as const,invalidState:false as const};
    if(invoice.rows[0].status!=="draft")return{notFound:false as const,invalidState:true as const};
    const total=Math.round(Number(invoice.rows[0].grand_total)*100),netRevenue=Math.round((Number(invoice.rows[0].subtotal)-Number(invoice.rows[0].discount_total))*100),tax=Math.round(Number(invoice.rows[0].tax_total)*100);
    if(total<=0||netRevenue<0||tax<0||netRevenue+tax!==total)return{notFound:false as const,invalidState:true as const};
    const ar=await account(c,"1100"),revenue=await account(c,"4000"),vat=tax>0?await account(c,"2100"):null;
    if(!ar||!revenue||(tax>0&&!vat))return{notFound:false as const,missingAccounts:true as const};
    const lines=[{accountId:ar,description:"Piutang invoice",debit:total,credit:0,customerId:invoice.rows[0].customer_id,invoiceId:invoiceId!}];
    if(netRevenue>0)lines.push({accountId:revenue,description:"Pendapatan lisensi dan layanan",debit:0,credit:netRevenue,customerId:invoice.rows[0].customer_id,invoiceId:invoiceId!});
    if(tax>0&&vat)lines.push({accountId:vat,description:"PPN keluaran",debit:0,credit:tax,customerId:invoice.rows[0].customer_id,invoiceId:invoiceId!});
    const journalId=await postJournal(c,userId,{entryNumber:numberId("JE"),date:businessDate(),description:`Penerbitan invoice ${invoiceId}`,sourceType:"invoice",sourceId:invoiceId!,postingKey:`INVOICE:${invoiceId}`,debit:total,credit:total,lines});
    await c.query("UPDATE platform.invoices SET status='issued',issued_on=$2::date,issued_at=now(),journal_entry_id=$3::uuid,updated_at=now() WHERE id=$1::uuid",[invoiceId,businessDate(),journalId]);
    await audit(c,userId,"billing.invoice.issued","invoice",invoiceId!,{journalEntryId:journalId,grandTotal:money(total)});
    return{notFound:false as const,invalidState:false as const,missingAccounts:false as const,journalId};
   });
   if(scoped.forbidden){reply(res,403,{error:"platform_super_admin_required"});return true;}
   if(scoped.value?.notFound){reply(res,404,{error:"invoice_not_found"});return true;}
   if(scoped.value?.invalidState){reply(res,409,{error:"invoice_not_issuable_or_invalid_total"});return true;}
   if(scoped.value && "missingAccounts" in scoped.value && scoped.value.missingAccounts){reply(res,409,{error:"default_chart_accounts_required"});return true;}
   const posted=scoped.value && "journalId" in scoped.value ? scoped.value.journalId : null;
   reply(res,200,{data:{id:invoiceId,status:"issued",journalEntryId:posted}});
  }catch(e){reply(res,500,{error:"invoice_issue_failed"});}
  return true;
 }

 if(req.method==="POST"&&paymentsPath){
  const body=await readJson(req);if(!body){reply(res,400,{error:"invalid_json_or_body_too_large"});return true;}
  const invalid=validatePaymentInput(body);if(invalid){reply(res,422,{error:invalid});return true;}
  try{
   const scoped=await withAdmin(pool,userId,async c=>{
    const invoice=await c.query<{id:string;customer_id:string;status:string;grand_total:string;amount_paid:string}>("SELECT id,customer_id,status,grand_total,amount_paid FROM platform.invoices WHERE id=$1::uuid FOR UPDATE",[body.invoiceId]);
    if(!invoice.rows[0])return{notFound:true as const,invalidState:false as const};
    const inv=invoice.rows[0],amount=amountCents(body.amount)!;
    const outstanding=Math.round((Number(inv.grand_total)-Number(inv.amount_paid))*100);
    if(!["issued","partially_paid","overdue"].includes(inv.status)||amount>outstanding)return{notFound:false as const,invalidState:true as const};
    const pending=await c.query("SELECT id FROM platform.payments WHERE invoice_id=$1::uuid AND status='pending' LIMIT 1",[body.invoiceId]);
    if(pending.rows[0])return{notFound:false as const,invalidState:true as const};
    const paymentReference=numberId("PAY");
    const result=await c.query(`INSERT INTO platform.payments(payment_reference,customer_id,invoice_id,amount,currency,payment_method,status,paid_at,external_reference) VALUES($1,$2::uuid,$3::uuid,$4::numeric,'IDR',$5,'pending',$6::timestamptz,$7) RETURNING id,payment_reference AS "paymentReference",customer_id AS "customerId",invoice_id AS "invoiceId",amount,payment_method AS "paymentMethod",status,paid_at AS "paidAt",created_at AS "createdAt"`,[paymentReference,inv.customer_id,body.invoiceId,money(amount),body.paymentMethod,body.paidAt??new Date().toISOString(),body.externalReference??null]);
    const row=result.rows[0] as {id:string}|undefined;if(!row)throw new Error("payment_insert_failed");
    await audit(c,userId,"billing.payment.created","payment",row.id,{invoiceId:body.invoiceId,amount:money(amount),paymentMethod:body.paymentMethod});
    return{notFound:false as const,invalidState:false as const,item:result.rows[0]};
   });
   if(scoped.forbidden){reply(res,403,{error:"platform_super_admin_required"});return true;}
   if(scoped.value?.notFound){reply(res,404,{error:"invoice_not_found"});return true;}
   if(scoped.value?.invalidState){reply(res,409,{error:"invoice_not_payable_or_amount_exceeds_outstanding"});return true;}
   reply(res,201,{data:scoped.value?.item});
  }catch(e){reply(res,500,{error:"payment_create_failed"});}
  return true;
 }

 if(req.method==="PATCH"&&paymentAction){
  try{
   const scoped=await withAdmin(pool,userId,async c=>{
    const payment=await c.query<{id:string;customer_id:string;invoice_id:string;amount:string;payment_method:string;status:string}>("SELECT id,customer_id,invoice_id,amount,payment_method,status FROM platform.payments WHERE id=$1::uuid FOR UPDATE",[paymentId]);
    if(!payment.rows[0])return{notFound:true as const,invalidState:false as const,selfApproval:false as const,missingAccounts:false as const};
    const p=payment.rows[0];
    if(p.status!=="pending")return{notFound:false as const,invalidState:true as const,selfApproval:false as const,missingAccounts:false as const};
    if(paymentVerb==="reject"){
     await c.query("UPDATE platform.payments SET status='rejected' WHERE id=$1::uuid",[paymentId]);
     await audit(c,userId,"billing.payment.rejected","payment",paymentId!,{});
     return{notFound:false as const,invalidState:false as const,selfApproval:false as const,missingAccounts:false as const};
    }
    const created=await c.query<{actor_user_id:string}>("SELECT actor_user_id FROM platform.audit_events WHERE resource_type='payment' AND resource_id=$1::uuid AND action='billing.payment.created' ORDER BY created_at DESC LIMIT 1",[paymentId]);
    if(!created.rows[0])return{notFound:false as const,invalidState:true as const,selfApproval:false as const,missingAccounts:false as const};
    if(created.rows[0].actor_user_id===userId)return{notFound:false as const,invalidState:false as const,selfApproval:true as const,missingAccounts:false as const};
    const invoice=await c.query<{status:string;grand_total:string;amount_paid:string;subscription_id:string|null;billing_period_end:string|null}>("SELECT status,grand_total,amount_paid,subscription_id,billing_period_end FROM platform.invoices WHERE id=$1::uuid FOR UPDATE",[p.invoice_id]);
    if(!invoice.rows[0]||!["issued","partially_paid","overdue"].includes(invoice.rows[0].status))return{notFound:false as const,invalidState:true as const,selfApproval:false as const,missingAccounts:false as const};
    const amount=Math.round(Number(p.amount)*100),outstanding=Math.round((Number(invoice.rows[0].grand_total)-Number(invoice.rows[0].amount_paid))*100);
    if(amount<=0||amount>outstanding)return{notFound:false as const,invalidState:true as const,selfApproval:false as const,missingAccounts:false as const};
    const cashCode=p.payment_method==="cash"?"1000":"1010",cash=await account(c,cashCode),ar=await account(c,"1100");
    if(!cash||!ar)return{notFound:false as const,invalidState:false as const,selfApproval:false as const,missingAccounts:true as const};
    const journalId=await postJournal(c,userId,{entryNumber:numberId("JE"),date:businessDate(),description:`Penerimaan pembayaran ${paymentId}`,sourceType:"payment",sourceId:paymentId!,postingKey:`PAYMENT:${paymentId}`,debit:amount,credit:amount,lines:[
     {accountId:cash,description:p.payment_method==="cash"?"Penerimaan kas":"Penerimaan bank",debit:amount,credit:0,customerId:p.customer_id,invoiceId:p.invoice_id},
     {accountId:ar,description:"Pelunasan piutang",debit:0,credit:amount,customerId:p.customer_id,invoiceId:p.invoice_id}
    ]});
    const newPaid=Math.round(Number(invoice.rows[0].amount_paid)*100)+amount,grand=Math.round(Number(invoice.rows[0].grand_total)*100),newStatus=newPaid>=grand?"paid":"partially_paid";
    await c.query("UPDATE platform.payments SET status='verified',verified_by=$2::uuid,verified_at=now(),journal_entry_id=$3::uuid WHERE id=$1::uuid",[paymentId,userId,journalId]);
    await c.query("UPDATE platform.invoices SET amount_paid=$2::numeric,status=$3,updated_at=now() WHERE id=$1::uuid",[p.invoice_id,money(newPaid),newStatus]);
    if(newStatus==="paid"&&invoice.rows[0].subscription_id&&invoice.rows[0].billing_period_end){
     await c.query(
      `UPDATE platform.subscriptions
       SET next_billing_at=((($2::date+1)::timestamp AT TIME ZONE 'UTC')),
           status=CASE WHEN ends_at IS NOT NULL AND ends_at < (($2::date+1)::timestamp AT TIME ZONE 'UTC') THEN 'expired' ELSE status END,
           updated_at=now()
       WHERE id=$1::uuid AND next_billing_at <= (($2::date+1)::timestamp AT TIME ZONE 'UTC')`,
      [invoice.rows[0].subscription_id,invoice.rows[0].billing_period_end]);
    }
    await audit(c,userId,"billing.payment.verified","payment",paymentId!,{invoiceId:p.invoice_id,journalEntryId:journalId,amount:money(amount)});
    return{notFound:false as const,invalidState:false as const,selfApproval:false as const,missingAccounts:false as const,journalId,newStatus};
   });
   if(scoped.forbidden){reply(res,403,{error:"platform_super_admin_required"});return true;}
   if(scoped.value?.notFound){reply(res,404,{error:"payment_not_found"});return true;}
   if(scoped.value?.selfApproval){reply(res,403,{error:"payment_creator_cannot_verify_own_payment"});return true;}
   if(scoped.value?.invalidState){reply(res,409,{error:"payment_not_verifiable_or_invoice_balance_invalid"});return true;}
   if(scoped.value?.missingAccounts){reply(res,409,{error:"default_chart_accounts_required"});return true;}
   const posted=scoped.value && "journalId" in scoped.value ? scoped.value.journalId : null;
   const newStatus=scoped.value && "newStatus" in scoped.value ? scoped.value.newStatus : undefined;
   reply(res,200,{data:{id:paymentId,status:paymentVerb==="verify"?(newStatus??"verified"):"rejected",journalEntryId:posted}});
  }catch(e){reply(res,500,{error:"payment_transition_failed"});}
  return true;
 }
 reply(res,405,{error:"method_not_allowed"});return true;
}
