import test from "node:test";
import assert from "node:assert/strict";
import { handlePlatformCommercialRequest, validateContractInput, validateQuoteInput } from "../dist/platform-commercial.js";
const userId="123e4567-e89b-42d3-a456-426614174000";
const customerId="223e4567-e89b-42d3-a456-426614174000";
const quoteId="323e4567-e89b-42d3-a456-426614174000";
function req(path,method="GET",body={}){return{url:path,method,headers:{},async *[Symbol.asyncIterator](){if(method!=="GET")yield Buffer.from(JSON.stringify(body));}};}
function response(){return{status:0,headers:{},body:"",setHeader(k,v){this.headers[k]=v;},writeHead(s,h={}){this.status=s;Object.assign(this.headers,h);},end(v=""){this.body=v;}};}
function createPool(queryImpl){const calls=[];const client={async query(sql,values=[]){calls.push({sql,values});return queryImpl(sql,values);},release(){calls.push({sql:"RELEASE",values:[]});}};return{pool:{query:client.query,async connect(){return client;}},calls};}
test("quote validator checks customer, line counts, money precision, and discount bounds",()=>{
 assert.equal(validateQuoteInput({customerId,lines:[]}),"quote_requires_1_to_50_lines");
 assert.equal(validateQuoteInput({customerId,lines:[{description:"Lisensi",quantity:1,unitPrice:100,discountAmount:120}]}),"line_discount_exceeds_gross");
 assert.equal(validateQuoteInput({customerId,lines:[{description:"Lisensi",quantity:1,unitPrice:100.001}]}),"invalid_unit_price");
 assert.equal(validateQuoteInput({customerId,lines:[{description:"Lisensi",quantity:1_000_000_000,unitPrice:1_000_000_000_000}]}),"line_total_too_large");
 assert.equal(validateQuoteInput({customerId,validUntil:"2026-02-30",lines:[{description:"Lisensi",quantity:1,unitPrice:100}]}),"invalid_valid_until");
 assert.equal(validateQuoteInput({customerId,lines:[{description:"Lisensi",quantity:2.5,unitPrice:100000,discountAmount:5000,taxAmount:0}]}),null);
});
test("contract validator requires valid quote and coherent dates",()=>{
 assert.equal(validateContractInput({quoteId:"invalid"}),"invalid_quote_id");
 assert.equal(validateContractInput({quoteId,startsOn:"2026-11-10",endsOn:"2026-11-01"}),"contract_end_before_start");
 assert.equal(validateContractInput({quoteId,startsOn:"2026-11-01",endsOn:"2027-11-01",renewalMode:"manual"}),null);
});
test("quote list is Super Admin-only and runs under platform runtime role",async()=>{
 const {pool,calls}=createPool(async sql=>{
  if(sql.startsWith("SELECT EXISTS"))return{rows:[{allowed:true}]};
  if(sql.startsWith("SELECT q.id"))return{rows:[{id:quoteId,quoteNumber:"QT-1",status:"draft"}]};
  return{rows:[]};
 });
 const res=response();
 await handlePlatformCommercialRequest(req("/v1/platform/erp/quotes"),res,pool,userId);
 assert.equal(res.status,200);
 assert.equal(JSON.parse(res.body).data.items[0].status,"draft");
 assert.ok(calls.some(x=>x.sql==="SET LOCAL ROLE pondok_platform_runtime"));
 assert.ok(calls.some(x=>x.sql==="COMMIT"));
});
test("non Super Admin cannot read commercial records",async()=>{
 const {pool,calls}=createPool(async()=>({rows:[{allowed:false}]}));
 const res=response();
 await handlePlatformCommercialRequest(req("/v1/platform/erp/contracts"),res,pool,userId);
 assert.equal(res.status,403);
 assert.ok(!calls.some(x=>x.sql.startsWith("SELECT k.id")));
});

test("quote creation stores a balanced price snapshot and audit event transactionally",async()=>{
 const {pool,calls}=createPool(async(sql)=>{
  if(sql.startsWith("SELECT EXISTS"))return{rows:[{allowed:true}]};
  if(sql.startsWith("SELECT id FROM platform.customers"))return{rows:[{id:customerId}]};
  if(sql.startsWith("SELECT id FROM platform.product_catalog"))return{rows:[{id:"423e4567-e89b-42d3-a456-426614174000"}]};
  if(sql.startsWith("INSERT INTO platform.quotes"))return{rows:[{id:quoteId,quoteNumber:"QT-1",grandTotal:"190.00"}]};
  return{rows:[]};
 });
 const res=response();
 await handlePlatformCommercialRequest(req("/v1/platform/erp/quotes","POST",{customerId,lines:[{productId:"423e4567-e89b-42d3-a456-426614174000",description:"Lisensi PONDOK",quantity:2,unitPrice:100,discountAmount:10,taxAmount:0}]}),res,pool,userId);
 assert.equal(res.status,201);
 assert.ok(calls.some(x=>x.sql.startsWith("INSERT INTO platform.quote_lines")));
 assert.ok(calls.some(x=>x.sql.startsWith("INSERT INTO platform.audit_events")));
 assert.ok(calls.some(x=>x.sql==="COMMIT"));
});
test("quote requester cannot approve their own pending approval request",async()=>{
 const {pool,calls}=createPool(async(sql)=>{
  if(sql.startsWith("SELECT EXISTS"))return{rows:[{allowed:true}]};
  if(sql.startsWith("SELECT id,status,created_by,discount_total"))return{rows:[{id:quoteId,status:"submitted",created_by:"423e4567-e89b-42d3-a456-426614174000",discount_total:"0.00"}]};
  if(sql.startsWith("SELECT id,requested_by FROM platform.approval_requests"))return{rows:[{id:"523e4567-e89b-42d3-a456-426614174000",requested_by:userId}]};
  return{rows:[]};
 });
 const res=response();
 await handlePlatformCommercialRequest(req(`/v1/platform/erp/quotes/${quoteId}/approve`,"PATCH"),res,pool,userId);
 assert.equal(res.status,403);
 assert.ok(!calls.some(x=>x.sql.startsWith("UPDATE platform.approval_requests")));
 assert.ok(calls.some(x=>x.sql==="COMMIT"));
});


test("active contract creates one scheduled subscription per recurring quote line with immutable price snapshot",async()=>{
 const contractId="423e4567-e89b-42d3-a456-426614174000";
 const quoteLineId="523e4567-e89b-42d3-a456-426614174000";
 const productId="623e4567-e89b-42d3-a456-426614174000";
 const subscriptionId="723e4567-e89b-42d3-a456-426614174000";
 const {pool,calls}=createPool(async(sql)=>{
  if(sql.startsWith("SELECT EXISTS"))return{rows:[{allowed:true}]};
  if(sql.startsWith("SELECT id,customer_id,quote_id,status,starts_on,ends_on"))return{rows:[{id:contractId,customer_id:customerId,quote_id:quoteId,status:"active",starts_on:"2027-01-01",ends_on:"2027-12-31"}]};
  if(sql.startsWith("SELECT status,currency FROM platform.quotes"))return{rows:[{status:"approved",currency:"IDR"}]};
  if(sql.startsWith("SELECT ql.id,ql.product_id"))return{rows:[{id:quoteLineId,product_id:productId,quantity:"2.000",unit_price:"100000.00",discount_amount:"5000.00",tax_amount:"0.00",line_total:"195000.00",product_type:"subscription",billing_interval:"monthly",is_active:true}]};
  if(sql.startsWith("SELECT id,status FROM platform.subscriptions WHERE quote_line_id"))return{rows:[]};
  if(sql.startsWith("INSERT INTO platform.subscriptions"))return{rows:[{id:subscriptionId,status:"scheduled",quoteLineId,productId,startsAt:"2027-01-01T00:00:00.000Z"}]};
  return{rows:[]};
 });
 const res=response();
 await handlePlatformCommercialRequest(req(`/v1/platform/erp/contracts/${contractId}/subscriptions`,"POST",{}),res,pool,userId);
 assert.equal(res.status,201);
 const data=JSON.parse(res.body).data;
 assert.equal(data.created,1);
 assert.equal(data.items[0].id,subscriptionId);
 assert.equal(data.entitlementsGranted,false);
 const insert=calls.find(x=>x.sql.startsWith("INSERT INTO platform.subscriptions"));
 assert.ok(insert);
 assert.equal(insert.values[4],"scheduled");
 assert.equal(insert.values[8],"100000.00");
 assert.equal(insert.values[9],"5000.00");
 assert.equal(insert.values[11],"195000.00");
 assert.equal(insert.values[13],"monthly");
 assert.ok(calls.some(x=>x.sql.startsWith("INSERT INTO platform.audit_events")&&x.values[1]==="commercial.subscription.created"));
 assert.ok(calls.some(x=>x.sql==="COMMIT"));
});

test("subscription generation requires an active contract and approved quote",async()=>{
 const contractId="423e4567-e89b-42d3-a456-426614174000";
 const {pool,calls}=createPool(async(sql)=>{
  if(sql.startsWith("SELECT EXISTS"))return{rows:[{allowed:true}]};
  if(sql.startsWith("SELECT id,customer_id,quote_id,status,starts_on,ends_on"))return{rows:[{id:contractId,customer_id:customerId,quote_id:quoteId,status:"review",starts_on:null,ends_on:null}]};
  return{rows:[]};
 });
 const res=response();
 await handlePlatformCommercialRequest(req(`/v1/platform/erp/contracts/${contractId}/subscriptions`,"POST",{}),res,pool,userId);
 assert.equal(res.status,409);
 assert.equal(JSON.parse(res.body).error,"contract_must_be_active");
 assert.ok(!calls.some(x=>x.sql.startsWith("INSERT INTO platform.subscriptions")));
});

test("subscription generation rejects contracts without recurring catalog lines",async()=>{
 const contractId="423e4567-e89b-42d3-a456-426614174000";
 const {pool,calls}=createPool(async(sql)=>{
  if(sql.startsWith("SELECT EXISTS"))return{rows:[{allowed:true}]};
  if(sql.startsWith("SELECT id,customer_id,quote_id,status,starts_on,ends_on"))return{rows:[{id:contractId,customer_id:customerId,quote_id:quoteId,status:"active",starts_on:null,ends_on:null}]};
  if(sql.startsWith("SELECT status,currency FROM platform.quotes"))return{rows:[{status:"approved",currency:"IDR"}]};
  if(sql.startsWith("SELECT ql.id,ql.product_id"))return{rows:[]};
  return{rows:[]};
 });
 const res=response();
 await handlePlatformCommercialRequest(req(`/v1/platform/erp/contracts/${contractId}/subscriptions`,"POST",{}),res,pool,userId);
 assert.equal(res.status,409);
 assert.equal(JSON.parse(res.body).error,"contract_has_no_recurring_products");
 assert.ok(!calls.some(x=>x.sql.startsWith("INSERT INTO platform.subscriptions")));
});

test("subscription generation is idempotent for an existing quote-line subscription",async()=>{
 const contractId="423e4567-e89b-42d3-a456-426614174000";
 const quoteLineId="523e4567-e89b-42d3-a456-426614174000";
 const {pool,calls}=createPool(async(sql)=>{
  if(sql.startsWith("SELECT EXISTS"))return{rows:[{allowed:true}]};
  if(sql.startsWith("SELECT id,customer_id,quote_id,status,starts_on,ends_on"))return{rows:[{id:contractId,customer_id:customerId,quote_id:quoteId,status:"active",starts_on:null,ends_on:null}]};
  if(sql.startsWith("SELECT status,currency FROM platform.quotes"))return{rows:[{status:"approved",currency:"IDR"}]};
  if(sql.startsWith("SELECT ql.id,ql.product_id"))return{rows:[{id:quoteLineId,product_id:"623e4567-e89b-42d3-a456-426614174000",quantity:"1.000",unit_price:"100.00",discount_amount:"0.00",tax_amount:"0.00",line_total:"100.00",product_type:"module",billing_interval:"yearly",is_active:true}]};
  if(sql.startsWith("SELECT id,status FROM platform.subscriptions WHERE quote_line_id"))return{rows:[{id:"723e4567-e89b-42d3-a456-426614174000",status:"active"}]};
  return{rows:[]};
 });
 const res=response();
 await handlePlatformCommercialRequest(req(`/v1/platform/erp/contracts/${contractId}/subscriptions`,"POST",{}),res,pool,userId);
 assert.equal(res.status,200);
 assert.equal(JSON.parse(res.body).data.created,0);
 assert.equal(JSON.parse(res.body).data.existing,1);
 assert.ok(!calls.some(x=>x.sql.startsWith("INSERT INTO platform.subscriptions")));
});

test("non Super Admin cannot generate subscriptions",async()=>{
 const contractId="423e4567-e89b-42d3-a456-426614174000";
 const {pool,calls}=createPool(async()=>({rows:[{allowed:false}]}));
 const res=response();
 await handlePlatformCommercialRequest(req(`/v1/platform/erp/contracts/${contractId}/subscriptions`,"POST",{}),res,pool,userId);
 assert.equal(res.status,403);
 assert.ok(!calls.some(x=>x.sql.startsWith("SELECT id,customer_id,quote_id,status")));
 assert.ok(calls.some(x=>x.sql==="ROLLBACK"));
});

test("subscription list is Super Admin-only and uses the platform runtime role",async()=>{
 const {pool,calls}=createPool(async(sql)=>{
  if(sql.startsWith("SELECT EXISTS"))return{rows:[{allowed:true}]};
  if(sql.startsWith("SELECT s.id"))return{rows:[{id:"723e4567-e89b-42d3-a456-426614174000",status:"active",billingInterval:"monthly"}]};
  return{rows:[]};
 });
 const res=response();
 await handlePlatformCommercialRequest(req("/v1/platform/erp/subscriptions"),res,pool,userId);
 assert.equal(res.status,200);
 assert.equal(JSON.parse(res.body).data.items[0].status,"active");
 assert.ok(calls.some(x=>x.sql==="SET LOCAL ROLE pondok_platform_runtime"));
 assert.ok(calls.some(x=>x.sql==="COMMIT"));
});


test("subscription generation rejects contracts whose billing period has expired",async()=>{
 const contractId="423e4567-e89b-42d3-a456-426614174000";
 const {pool,calls}=createPool(async(sql)=>{
  if(sql.startsWith("SELECT EXISTS"))return{rows:[{allowed:true}]};
  if(sql.startsWith("SELECT id,customer_id,quote_id,status,starts_on,ends_on"))return{rows:[{id:contractId,customer_id:customerId,quote_id:quoteId,status:"active",starts_on:"2025-01-01",ends_on:"2025-12-31"}]};
  if(sql.startsWith("SELECT status,currency FROM platform.quotes"))return{rows:[{status:"approved",currency:"IDR"}]};
  if(sql.startsWith("SELECT ql.id,ql.product_id"))return{rows:[{id:"523e4567-e89b-42d3-a456-426614174000",product_id:"623e4567-e89b-42d3-a456-426614174000",quantity:"1.000",unit_price:"100.00",discount_amount:"0.00",tax_amount:"0.00",line_total:"100.00",product_type:"subscription",billing_interval:"monthly",is_active:true}]};
  return{rows:[]};
 });
 const res=response();
 await handlePlatformCommercialRequest(req(`/v1/platform/erp/contracts/${contractId}/subscriptions`,"POST",{}),res,pool,userId);
 assert.equal(res.status,409);
 assert.equal(JSON.parse(res.body).error,"contract_period_expired");
 assert.ok(!calls.some(x=>x.sql.startsWith("INSERT INTO platform.subscriptions")));
});
