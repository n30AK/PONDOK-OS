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

test("customer validation accepts a tenant UUID and rejects malformed tenant identifiers",()=>{
  assert.equal(validateCustomerInput({legalName:"Yayasan Contoh",displayName:"Pondok Contoh",organizationId:"not-a-uuid"}),"invalid_organization_id");
  assert.equal(validateCustomerInput({legalName:"Yayasan Contoh",displayName:"Pondok Contoh",organizationId:"323e4567-e89b-42d3-a456-426614174000"}),null);
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


test("executive metrics return aggregated commercial and operations counts to Super Admin",async()=>{
  const {pool,calls}=poolWithClient(async(sql)=>{
    if(sql.startsWith("SELECT EXISTS")) return {rows:[{allowed:true}]};
    if(sql.includes('AS "totalCustomers"')) return {rows:[{
      totalCustomers:4,activeCustomers:2,activeSubscriptions:3,outstandingInvoices:2,
      onlineInstallations:5,degradedInstallations:1,offlineInstallations:2,
      openSupportCases:3,backupFailuresLast30Days:1,asOf:"2026-11-09T00:00:00.000Z"
    }]};
    return {rows:[]};
  });
  const res=response();
  await handlePlatformErpRequest(request("/v1/platform/erp/executive-metrics"),res,pool,userId);
  assert.equal(res.status,200);
  const metrics=JSON.parse(res.body).data;
  assert.equal(metrics.totalCustomers,4);
  assert.equal(metrics.activeSubscriptions,3);
  assert.equal(metrics.outstandingInvoices,2);
  assert.equal(metrics.offlineInstallations,2);
  assert.equal(metrics.backupFailuresLast30Days,1);
  assert.equal(Object.hasOwn(metrics,"customerNames"),false);
  assert.ok(calls.some(x=>x.sql==="SET LOCAL ROLE pondok_platform_runtime"));
  assert.ok(calls.some(x=>x.sql==="COMMIT"));
});

test("executive metrics are denied to non Super Admin before platform data is read",async()=>{
  const {pool,calls}=poolWithClient(async()=>({rows:[{allowed:false}]}));
  const res=response();
  await handlePlatformErpRequest(request("/v1/platform/erp/executive-metrics"),res,pool,userId);
  assert.equal(res.status,403);
  assert.ok(!calls.some(x=>x.sql.includes("AS \"totalCustomers\"")));
  assert.ok(calls.some(x=>x.sql==="ROLLBACK"));
});

test("executive metrics endpoint is read-only",async()=>{
  const {pool,calls}=poolWithClient(async()=>({rows:[{allowed:true}]}));
  const res=response();
  await handlePlatformErpRequest(request("/v1/platform/erp/executive-metrics","POST",{}),res,pool,userId);
  assert.equal(res.status,405);
  assert.ok(!calls.some(x=>x.sql.startsWith("SELECT EXISTS")));
});


test("customer creation validates tenant existence and stores the tenant link atomically",async()=>{
  const organizationId="323e4567-e89b-42d3-a456-426614174000";
  const customerId="423e4567-e89b-42d3-a456-426614174000";
  const {pool,calls}=poolWithClient(async(sql)=>{
    if(sql.startsWith("SELECT EXISTS")) return {rows:[{allowed:true}]};
    if(sql.startsWith("SELECT id FROM core.organizations")) return {rows:[{id:organizationId}]};
    if(sql.startsWith("SELECT id FROM platform.customers WHERE organization_id")) return {rows:[]};
    if(sql.startsWith("INSERT INTO platform.customers")) return {rows:[{id:customerId,customerCode:"CUS-1",organizationId}]};
    return {rows:[]};
  });
  const res=response();
  await handlePlatformErpRequest(request("/v1/platform/erp/customers","POST",{legalName:"Yayasan Contoh",displayName:"Pondok Contoh",organizationId}),res,pool,userId);
  assert.equal(res.status,201);
  assert.equal(JSON.parse(res.body).data.organizationId,organizationId);
  const insert=calls.find(x=>x.sql.startsWith("INSERT INTO platform.customers"));
  assert.ok(insert);
  assert.equal(insert.values[8],organizationId);
  assert.ok(calls.some(x=>x.sql.startsWith("INSERT INTO platform.audit_events")));
  assert.ok(calls.some(x=>x.sql==="COMMIT"));
});

test("customer cannot be linked to a nonexistent or already-linked tenant",async()=>{
  const organizationId="323e4567-e89b-42d3-a456-426614174000";
  const {pool,calls}=poolWithClient(async(sql)=>{
    if(sql.startsWith("SELECT EXISTS")) return {rows:[{allowed:true}]};
    if(sql.startsWith("SELECT id FROM core.organizations")) return {rows:[]};
    return {rows:[]};
  });
  const res=response();
  await handlePlatformErpRequest(request("/v1/platform/erp/customers","POST",{legalName:"Yayasan Contoh",displayName:"Pondok Contoh",organizationId}),res,pool,userId);
  assert.equal(res.status,404);
  assert.equal(JSON.parse(res.body).error,"organization_not_found");
  assert.ok(!calls.some(x=>x.sql.startsWith("INSERT INTO platform.customers")));
});

test("existing CRM customer can be linked to exactly one tenant with an audit event",async()=>{
  const organizationId="323e4567-e89b-42d3-a456-426614174000";
  const customerId="423e4567-e89b-42d3-a456-426614174000";
  const {pool,calls}=poolWithClient(async(sql)=>{
    if(sql.startsWith("SELECT EXISTS")) return {rows:[{allowed:true}]};
    if(sql.startsWith("SELECT id,organization_id")) return {rows:[{id:customerId,organizationId:null}]};
    if(sql.startsWith("SELECT id,name,slug FROM core.organizations")) return {rows:[{id:organizationId,name:"Pondok Contoh",slug:"pondok-contoh"}]};
    if(sql.startsWith("SELECT id FROM platform.customers WHERE organization_id")) return {rows:[]};
    if(sql.startsWith("UPDATE platform.customers SET organization_id")) return {rows:[{id:customerId,organizationId}]};
    return {rows:[]};
  });
  const res=response();
  await handlePlatformErpRequest(request(`/v1/platform/erp/customers/${customerId}`,"PATCH",{organizationId}),res,pool,userId);
  assert.equal(res.status,200);
  assert.equal(JSON.parse(res.body).data.organizationId,organizationId);
  assert.ok(calls.some(x=>x.sql.startsWith("UPDATE platform.customers SET organization_id")));
  assert.ok(calls.some(x=>x.sql.startsWith("INSERT INTO platform.audit_events")));
  assert.ok(calls.some(x=>x.sql==="COMMIT"));
});

test("customer link cannot be silently reassigned to a different tenant",async()=>{
  const customerId="423e4567-e89b-42d3-a456-426614174000";
  const {pool,calls}=poolWithClient(async(sql)=>{
    if(sql.startsWith("SELECT EXISTS")) return {rows:[{allowed:true}]};
    if(sql.startsWith("SELECT id,organization_id")) return {rows:[{id:customerId,organizationId:"523e4567-e89b-42d3-a456-426614174000"}]};
    return {rows:[]};
  });
  const res=response();
  await handlePlatformErpRequest(request(`/v1/platform/erp/customers/${customerId}`,"PATCH",{organizationId:"623e4567-e89b-42d3-a456-426614174000"}),res,pool,userId);
  assert.equal(res.status,409);
  assert.equal(JSON.parse(res.body).error,"customer_already_linked");
  assert.ok(!calls.some(x=>x.sql.startsWith("UPDATE platform.customers SET organization_id")));
});
