import test from "node:test";
import assert from "node:assert/strict";
import { handlePlatformBillingRequest, validateInvoiceInput, validatePaymentInput } from "../dist/platform-billing.js";
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
