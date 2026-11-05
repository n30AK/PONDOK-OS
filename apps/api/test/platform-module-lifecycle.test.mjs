import test from "node:test";
import assert from "node:assert/strict";
import { handlePlatformModuleLifecycleRequest, validateModuleOrder } from "../dist/platform-module-lifecycle.js";
const userId="123e4567-e89b-42d3-a456-426614174000";
const customerId="223e4567-e89b-42d3-a456-426614174000";
const installationId="323e4567-e89b-42d3-a456-426614174000";
const moduleId="423e4567-e89b-42d3-a456-426614174000";
const contractId="523e4567-e89b-42d3-a456-426614174000";
function req(path,method="GET",body={},headers={}){return{url:path,method,headers,async *[Symbol.asyncIterator](){if(method!=="GET")yield Buffer.from(JSON.stringify(body));}};}
function response(){return{status:0,headers:{},body:"",setHeader(k,v){this.headers[k]=v;},writeHead(s,h={}){this.status=s;Object.assign(this.headers,h);},end(v=""){this.body=v;}};}
function createPool(queryImpl){const calls=[];const client={async query(sql,values=[]){calls.push({sql,values});return queryImpl(sql,values);},release(){calls.push({sql:"RELEASE",values:[]});}};return{pool:{query:client.query,async connect(){return client;}},calls};}
test("module order validator requires a valid customer, installation, module, and active contract reference",()=>{
 const valid={customerId,installationId,moduleId,contractId,quantity:1,billingMode:"one_time"};
 assert.equal(validateModuleOrder(valid),null);
 assert.equal(validateModuleOrder({...valid,installationId:"bad"}),"invalid_installation_id");
 assert.equal(validateModuleOrder({...valid,billingMode:"free_forever"}),"invalid_billing_mode");
 assert.equal(validateModuleOrder({...valid,billingPeriodStart:"2026-02-30"}),"invalid_billing_period_start");
});
test("module catalog reads require an active Super Admin and use runtime role",async()=>{
 const {pool,calls}=createPool(async sql=>{
  if(sql.startsWith("SELECT EXISTS"))return{rows:[{allowed:true}]};
  if(sql.startsWith("SELECT id,module_key"))return{rows:[{id:moduleId,moduleKey:"crm_sales",lifecycleStatus:"foundation"}]};
  return{rows:[]};
 });
 const res=response();
 await handlePlatformModuleLifecycleRequest(req("/v1/platform/erp/module-catalog"),res,pool,userId);
 assert.equal(res.status,200);
 assert.ok(calls.some(x=>x.sql==="SET LOCAL ROLE pondok_platform_runtime"));
 assert.ok(calls.some(x=>x.sql==="COMMIT"));
});
test("non Super Admin cannot seed module catalog",async()=>{
 const {pool,calls}=createPool(async()=>({rows:[{allowed:false}]}));
 const res=response();
 await handlePlatformModuleLifecycleRequest(req("/v1/platform/erp/module-catalog/seed-defaults","POST"),res,pool,userId);
 assert.equal(res.status,403);
 assert.ok(!calls.some(x=>x.sql.startsWith("INSERT INTO platform.module_catalog")));
});
test("module order creation requires an idempotency key before database mutation",async()=>{
 const {pool,calls}=createPool(async()=>({rows:[{allowed:true}]}));
 const res=response();
 await handlePlatformModuleLifecycleRequest(req("/v1/platform/erp/module-orders","POST",{customerId,installationId,moduleId,contractId}),res,userId?pool:pool,userId);
 assert.equal(res.status,422);
 assert.equal(JSON.parse(res.body).error,"idempotency_key_required");
 assert.equal(calls.length,0);
});
