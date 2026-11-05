import test from "node:test";
import assert from "node:assert/strict";
import { handlePlatformCustomerCatalogRequest, validateCustomerContact, validateProduct } from "../dist/platform-customer-catalog.js";
const userId="123e4567-e89b-42d3-a456-426614174000";
const customerId="223e4567-e89b-42d3-a456-426614174000";
function req(path,method="GET",body={}){return{url:path,method,headers:{},async *[Symbol.asyncIterator](){if(method!=="GET")yield Buffer.from(JSON.stringify(body));}};}
function res(){return{status:0,headers:{},body:"",setHeader(k,v){this.headers[k]=v;},writeHead(s,h={}){this.status=s;Object.assign(this.headers,h);},end(v=""){this.body=v;}};}
function createPool(queryImpl){const calls=[];const client={async query(sql,values=[]){calls.push({sql,values});return queryImpl(sql,values);},release(){calls.push({sql:"RELEASE",values:[]});}};return{pool:{query:client.query,async connect(){return client;}},calls};}
test("customer contact validation enforces name, email, and preferences object",()=>{
 assert.equal(validateCustomerContact({fullName:"A",email:"bad"}),"invalid_contact_name");
 assert.equal(validateCustomerContact({fullName:"Administrator",email:"bad"}),"invalid_contact_email");
 assert.equal(validateCustomerContact({fullName:"Administrator",contactPreferences:"bad"}),"invalid_contact_preferences");
 assert.equal(validateCustomerContact({fullName:"Administrator",email:"admin@example.org",isPrimary:true}),null);
});
test("product validation rejects unsupported type and negative price",()=>{
 assert.equal(validateProduct({productName:"PONDOK OS",productType:"unknown"}),"invalid_product_type");
 assert.equal(validateProduct({productName:"PONDOK OS",basePrice:-1}),"invalid_base_price");
 assert.equal(validateProduct({productName:"PONDOK OS",productType:"subscription",basePrice:0,currency:"IDR"}),null);
});
test("customer contacts list is Super Admin-only and uses platform runtime role",async()=>{
 const {pool,calls}=createPool(async sql=>{
  if(sql.startsWith("SELECT EXISTS"))return{rows:[{allowed:true}]};
  if(sql.startsWith("SELECT id,customer_id"))return{rows:[{id:"323e4567-e89b-42d3-a456-426614174000",fullName:"Administrator",isPrimary:true}]};
  return{rows:[]};
 });
 const response=res();
 await handlePlatformCustomerCatalogRequest(req(`/v1/platform/erp/customers/${customerId}/contacts`),response,pool,userId);
 assert.equal(response.status,200);
 assert.equal(JSON.parse(response.body).data.items[0].isPrimary,true);
 assert.ok(calls.some(x=>x.sql==="SET LOCAL ROLE pondok_platform_runtime"));
 assert.ok(calls.some(x=>x.sql==="COMMIT"));
});
test("non Super Admin cannot read catalog",async()=>{
 const {pool,calls}=createPool(async()=>({rows:[{allowed:false}]}));
 const response=res();
 await handlePlatformCustomerCatalogRequest(req("/v1/platform/erp/catalog"),response,pool,userId);
 assert.equal(response.status,403);
 assert.ok(!calls.some(x=>x.sql.startsWith("SELECT id,product_code")));
});
