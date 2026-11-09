import test from "node:test";
import assert from "node:assert/strict";
import { handlePlatformBillingRequest, validateInvoiceInput, validatePaymentInput, validateSubscriptionInvoiceInput } from "../dist/platform-billing.js";
const userId="123e4567-e89b-42d3-a456-426614174000";
const invoiceId="223e4567-e89b-42d3-a456-426614174000";
const paymentId="323e4567-e89b-42d3-a456-426614174000";
function req(path,method="GET",body={}){return{url:path,method,headers:{},async *[Symbol.asyncIterator](){if(method!=="GET")yield Buffer.from(JSON.stringify(body));}};}
function response(){return{status:0,headers:{},body:"",setHeader(k,v){this.headers[k]=v;},writeHead(s,h={}){this.status=s;Object.assign(this.headers,h);},end(v=""){this.body=v;}};}
function createPool(queryImpl){const calls=[];const client={async query(sql,values=[]){calls.push({sql,values});return queryImpl(sql,values);},release(){calls.push({sql:"RELEASE",values:[]});}};return{pool:{query:client.query,async connect(){return client;}},calls};}
test("invoice validation requires active contract id and real due date",()=>{
 assert.equal(validateInvoiceInput({contractId:"bad",dueOn:"2026-12-01"}),"invalid_contract_id");
 assert.equal(validateInvoiceInput({contractId:invoiceId,dueOn:"2026-02-30"}),"invalid_due_date");
 assert.equal(validateInvoiceInput({contractId:invoiceId,dueOn:"2026-12-01"}),null);
});
test("subscription invoice validation accepts only a real due date",()=>{
 assert.equal(validateSubscriptionInvoiceInput({dueOn:"2026-12-01"}),null);
 assert.equal(validateSubscriptionInvoiceInput({dueOn:"2026-02-30"}),"invalid_due_date");
 assert.equal(validateSubscriptionInvoiceInput({dueOn:"2026-12-01",amount:100}),"unsupported_subscription_invoice_field");
});
test("due active subscription creates one draft invoice with immutable billing period snapshot",async()=>{
 const subscriptionId="523e4567-e89b-42d3-a456-426614174000",invoiceId="623e4567-e89b-42d3-a456-426614174000";
 const {pool,calls}=createPool(async(sql,values)=>{
  if(sql.startsWith("SELECT EXISTS"))return{rows:[{allowed:true}]};
  if(sql.startsWith("SELECT s.id,s.customer_id"))return{rows:[{id:subscriptionId,customer_id:userId,customer_status:"active",contract_id:"423e4567-e89b-42d3-a456-426614174000",contract_status:"active",product_id:"723e4567-e89b-42d3-a456-426614174000",product_name:"PONDOK OS Core",status:"active",starts_at:"2026-11-09T00:00:00.000Z",ends_at:null,next_billing_at:"2026-11-09T00:00:00.000Z",quantity:2,unit_price:"100000.00",discount_amount:"5000.00",tax_amount:"0.00",line_total:"195000.00",currency:"IDR",billing_interval:"monthly",period_start:"2026-11-09",subscription_end_date:null}]};
  if(sql.startsWith("SELECT id,invoice_number,status FROM platform.invoices"))return{rows:[]};
  if(sql.startsWith("SELECT id FROM platform.invoices WHERE subscription_id"))return{rows:[]};
  if(sql.startsWith("INSERT INTO platform.invoices"))return{rows:[{id:invoiceId,invoiceNumber:"INV-CI-1",customerId:userId,contractId:"423e4567-e89b-42d3-a456-426614174000",subscriptionId,status:"draft",currency:"IDR",dueOn:"2026-11-23",billingPeriodStart:"2026-11-09",billingPeriodEnd:"2026-12-08",grandTotal:"195000.00"}]};
  return{rows:[]};
 });
 const res=response();
 await handlePlatformBillingRequest(req(`/v1/platform/erp/subscriptions/${subscriptionId}/invoices`,"POST",{dueOn:"2026-11-23"}),res,pool,userId);
 assert.equal(res.status,201);
 const data=JSON.parse(res.body).data;
 assert.equal(data.subscriptionId,subscriptionId);
 assert.equal(data.billingPeriodStart,"2026-11-09");
 assert.equal(data.billingPeriodEnd,"2026-12-08");
 const insert=calls.find(x=>x.sql.startsWith("INSERT INTO platform.invoices"));
 assert.ok(insert.sql.includes("billing_period_start,billing_period_end"));
 assert.deepEqual(insert.values.slice(6,8),["2026-11-09","2026-12-08"]);
 assert.ok(calls.some(x=>x.sql.startsWith("INSERT INTO platform.invoice_lines")));
 assert.ok(calls.some(x=>x.sql.startsWith("INSERT INTO platform.audit_events")&&x.values[1]==="billing.subscription_invoice.created"));
 assert.ok(calls.some(x=>x.sql==="COMMIT"));
});
test("subscription invoice generation rejects a future billing date before writing",async()=>{
 const subscriptionId="523e4567-e89b-42d3-a456-426614174000";
 const {pool,calls}=createPool(async(sql)=>{
  if(sql.startsWith("SELECT EXISTS"))return{rows:[{allowed:true}]};
  if(sql.startsWith("SELECT s.id,s.customer_id"))return{rows:[{id:subscriptionId,customer_id:userId,customer_status:"active",contract_id:"423e4567-e89b-42d3-a456-426614174000",contract_status:"active",product_id:"723e4567-e89b-42d3-a456-426614174000",product_name:"PONDOK OS Core",status:"active",starts_at:"2026-12-01T00:00:00.000Z",ends_at:null,next_billing_at:"2099-12-01T00:00:00.000Z",quantity:1,unit_price:"100.00",discount_amount:"0.00",tax_amount:"0.00",line_total:"100.00",currency:"IDR",billing_interval:"monthly",period_start:"2099-12-01",subscription_end_date:null}]};
  return{rows:[]};
 });
 const res=response();
 await handlePlatformBillingRequest(req(`/v1/platform/erp/subscriptions/${subscriptionId}/invoices`,"POST",{dueOn:"2099-12-15"}),res,pool,userId);
 assert.equal(res.status,409);
 assert.equal(JSON.parse(res.body).error,"subscription_not_due");
 assert.ok(!calls.some(x=>x.sql.startsWith("INSERT INTO platform.invoices")));
});
test("subscription invoice generation is idempotent for the same period",async()=>{
 const subscriptionId="523e4567-e89b-42d3-a456-426614174000",invoiceId="623e4567-e89b-42d3-a456-426614174000";
 const {pool,calls}=createPool(async(sql)=>{
  if(sql.startsWith("SELECT EXISTS"))return{rows:[{allowed:true}]};
  if(sql.startsWith("SELECT s.id,s.customer_id"))return{rows:[{id:subscriptionId,customer_id:userId,customer_status:"active",contract_id:"423e4567-e89b-42d3-a456-426614174000",contract_status:"active",product_id:"723e4567-e89b-42d3-a456-426614174000",product_name:"PONDOK OS Core",status:"active",starts_at:"2026-11-09T00:00:00.000Z",ends_at:null,next_billing_at:"2026-11-09T00:00:00.000Z",quantity:1,unit_price:"100.00",discount_amount:"0.00",tax_amount:"0.00",line_total:"100.00",currency:"IDR",billing_interval:"monthly",period_start:"2026-11-09",subscription_end_date:null}]};
  if(sql.startsWith("SELECT id,invoice_number,status FROM platform.invoices"))return{rows:[{id:invoiceId,invoice_number:"INV-CI-1",status:"draft"}]};
  return{rows:[]};
 });
 const res=response();
 await handlePlatformBillingRequest(req(`/v1/platform/erp/subscriptions/${subscriptionId}/invoices`,"POST",{dueOn:"2026-11-23"}),res,pool,userId);
 assert.equal(res.status,200);
 assert.equal(JSON.parse(res.body).alreadyExists,true);
 assert.ok(!calls.some(x=>x.sql.startsWith("INSERT INTO platform.invoices")));
});
test("payment validation rejects invalid amount and method",()=>{
 assert.equal(validatePaymentInput({invoiceId,amount:0,paymentMethod:"cash"}),"invalid_payment_amount");
 assert.equal(validatePaymentInput({invoiceId,amount:100,paymentMethod:"crypto"}),"invalid_payment_method");
 assert.equal(validatePaymentInput({invoiceId,amount:100,paymentMethod:"bank_transfer"}),null);
});
test("invoice issue posts balanced journal entries and marks invoice issued in one transaction",async()=>{
 const {pool,calls}=createPool(async(sql,values)=>{
  if(sql.startsWith("SELECT EXISTS"))return{rows:[{allowed:true}]};
  if(sql.startsWith("SELECT id,customer_id,status,subtotal"))return{rows:[{id:invoiceId,customer_id:userId,status:"draft",subtotal:"100.00",discount_total:"0.00",tax_total:"11.00",grand_total:"111.00",due_on:"2026-12-01"}]};
  if(sql.startsWith("SELECT id FROM platform.chart_of_accounts"))return{rows:[{id:`account-${values[0]}`}]};
  if(sql.startsWith("INSERT INTO platform.journal_entries"))return{rows:[{id:"423e4567-e89b-42d3-a456-426614174000"}]};
  return{rows:[]};
 });
 const res=response();
 await handlePlatformBillingRequest(req(`/v1/platform/erp/invoices/${invoiceId}/issue`,"PATCH"),res,pool,userId);
 assert.equal(res.status,200);
 assert.equal(calls.filter(x=>x.sql.startsWith("INSERT INTO platform.journal_lines")).length,3);
 assert.ok(calls.some(x=>x.sql.startsWith("UPDATE platform.invoices SET status='issued'")));
 assert.ok(calls.some(x=>x.sql.startsWith("INSERT INTO platform.audit_events")));
 assert.ok(calls.some(x=>x.sql==="COMMIT"));
});
test("fully verified recurring invoice advances next billing date in the same transaction",async()=>{
 const subscriptionId="523e4567-e89b-42d3-a456-426614174000",creatorId="923e4567-e89b-42d3-a456-426614174000";
 const {pool,calls}=createPool(async(sql,values)=>{
  if(sql.startsWith("SELECT EXISTS"))return{rows:[{allowed:true}]};
  if(sql.startsWith("SELECT id,customer_id,invoice_id,amount,payment_method,status"))return{rows:[{id:paymentId,customer_id:userId,invoice_id:invoiceId,amount:"100.00",payment_method:"bank_transfer",status:"pending"}]};
  if(sql.startsWith("SELECT actor_user_id"))return{rows:[{actor_user_id:creatorId}]};
  if(sql.startsWith("SELECT status,grand_total,amount_paid,subscription_id,billing_period_end"))return{rows:[{status:"issued",grand_total:"100.00",amount_paid:"0.00",subscription_id:subscriptionId,billing_period_end:"2026-11-30"}]};
  if(sql.startsWith("SELECT id FROM platform.chart_of_accounts"))return{rows:[{id:`account-${values[0]}`}]};
  if(sql.startsWith("INSERT INTO platform.journal_entries"))return{rows:[{id:"823e4567-e89b-42d3-a456-426614174000"}]};
  return{rows:[]};
 });
 const res=response();
 await handlePlatformBillingRequest(req(`/v1/platform/erp/payments/${paymentId}/verify`,"PATCH"),res,pool,userId);
 assert.equal(res.status,200);
 const advance=calls.find(x=>x.sql.startsWith("UPDATE platform.subscriptions SET next_billing_at"));
 assert.ok(advance,"subscription must advance only after full invoice settlement");
 assert.equal(advance.values[0],subscriptionId);
 assert.equal(advance.values[1],"2026-11-30");
 assert.ok(calls.some(x=>x.sql.startsWith("UPDATE platform.invoices SET amount_paid")));
});
test("payment creator cannot verify their own payment",async()=>{
 const {pool,calls}=createPool(async(sql)=>{
  if(sql.startsWith("SELECT EXISTS"))return{rows:[{allowed:true}]};
  if(sql.startsWith("SELECT id,customer_id,invoice_id,amount,payment_method,status"))return{rows:[{id:paymentId,customer_id:userId,invoice_id:invoiceId,amount:"50.00",payment_method:"bank_transfer",status:"pending"}]};
  if(sql.startsWith("SELECT actor_user_id"))return{rows:[{actor_user_id:userId}]};
  return{rows:[]};
 });
 const res=response();
 await handlePlatformBillingRequest(req(`/v1/platform/erp/payments/${paymentId}/verify`,"PATCH"),res,pool,userId);
 assert.equal(res.status,403);
 assert.ok(!calls.some(x=>x.sql.startsWith("INSERT INTO platform.journal_entries")));
 assert.ok(calls.some(x=>x.sql==="COMMIT"));
});
