import test from "node:test";
import assert from "node:assert/strict";
import { handlePlatformErpRequest, validateCustomerInput, validateLeadInput } from "../dist/platform-erp.js";

const userId = "123e4567-e89b-42d3-a456-426614174000";
function request(path, method = "GET", body = {}) {
  return { url: path, method, headers: {}, async *[Symbol.asyncIterator]() { if (method !== "GET") yield Buffer.from(JSON.stringify(body)); } };
}
function response() {
  return { status: 0, headers: {}, body: "", setHeader(k,v){this.headers[k]=v;}, writeHead(s,h={}){this.status=s;Object.assign(this.headers,h);}, end(v=""){this.body=v;} };
}
function poolWithClient(queryImpl) {
  const calls=[];
  const client={
    async query(sql,values=[]){calls.push({sql,values});return queryImpl(sql,values);},
    release(){calls.push({sql:"RELEASE",values:[]});}
  };
  return {pool:{query:client.query,async connect(){return client;}},calls};
}

test("lead validation rejects invalid email, stage, and negative value",()=>{
  assert.equal(validateLeadInput({organizationName:"Pondok",contactName:"Admin",email:"bad"}),"invalid_email");
  assert.equal(validateLeadInput({organizationName:"Pondok",contactName:"Admin",stage:"invented"}),"invalid_lead_stage");
  assert.equal(validateLeadInput({organizationName:"Pondok",contactName:"Admin",estimatedValue:-1}),"invalid_estimated_value");
  assert.equal(validateLeadInput({organizationName:"Pondok",contactName:"Admin",email:"admin@example.org",stage:"new"}),null);
});

test("customer validation requires legal and display names and object address",()=>{
  assert.equal(validateCustomerInput({legalName:"A",displayName:"A"}),"invalid_legal_name");
  assert.equal(validateCustomerInput({legalName:"Yayasan Contoh",displayName:"Pondok Contoh",billingAddress:"not-an-object"}),"invalid_billing_address");
  assert.equal(validateCustomerInput({legalName:"Yayasan Contoh",displayName:"Pondok Contoh",billingAddress:{city:"Bandung"}}),null);
});

test("CRM list uses Super Admin verification and platform runtime role",async()=>{
  const {pool,calls}=poolWithClient(async(sql)=>{
    if(sql.startsWith("SELECT EXISTS")) return {rows:[{allowed:true}]};
    if(sql.startsWith("SELECT id,lead_number")) return {rows:[{id:"223e4567-e89b-42d3-a456-426614174000",leadNumber:"LD-1",stage:"new"}]};
    return {rows:[]};
  });
  const res=response();
  await handlePlatformErpRequest(request("/v1/platform/erp/leads?q=pondok"),res,pool,userId);
  assert.equal(res.status,200);
  assert.equal(JSON.parse(res.body).data.items[0].stage,"new");
  assert.ok(calls.some(x=>x.sql==="SET LOCAL ROLE pondok_platform_runtime"));
  assert.ok(calls.some(x=>x.sql==="COMMIT"));
  assert.ok(calls.some(x=>x.sql==="RELEASE"));
});

test("non Super Admin is denied before ERP table access",async()=>{
  const {pool,calls}=poolWithClient(async()=>({rows:[{allowed:false}]}));
  const res=response();
  await handlePlatformErpRequest(request("/v1/platform/erp/customers"),res,pool,userId);
  assert.equal(res.status,403);
  assert.ok(!calls.some(x=>x.sql.startsWith("SELECT id,customer_code")));
  assert.ok(!calls.some(x=>x.sql==="SET LOCAL ROLE pondok_platform_runtime"));
  assert.ok(calls.some(x=>x.sql==="ROLLBACK"));
});

test("lead creation writes the lead and an audit event in one transaction",async()=>{
  const {pool,calls}=poolWithClient(async(sql)=>{
    if(sql.startsWith("SELECT EXISTS")) return {rows:[{allowed:true}]};
    if(sql.startsWith("INSERT INTO platform.crm_leads")) return {rows:[{id:"223e4567-e89b-42d3-a456-426614174000",leadNumber:"LD-1"}]};
    return {rows:[]};
  });
  const res=response();
  await handlePlatformErpRequest(request("/v1/platform/erp/leads","POST",{organizationName:"Pondok Contoh",contactName:"Admin",email:"admin@example.org"}),res,pool,userId);
  assert.equal(res.status,201);
  assert.ok(calls.some(x=>x.sql.startsWith("INSERT INTO platform.audit_events")));
  assert.ok(calls.some(x=>x.sql==="COMMIT"));
});
