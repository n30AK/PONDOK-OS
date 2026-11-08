import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { handleModuleRecordsRequest } from "../dist/module-records.js";

const userId="123e4567-e89b-42d3-a456-426614174000";
const organizationId="223e4567-e89b-42d3-a456-426614174000";
const relationId="323e4567-e89b-42d3-a456-426614174000";
function responseDouble(){return{statusCode:0,headers:{},body:"",writeHead(status,headers){this.statusCode=status;this.headers=headers;},setHeader(name,value){this.headers[name]=value;},end(body){this.body=body??"";}};}
function request(method,url,body){const stream=Readable.from(body===undefined?[]:[Buffer.from(JSON.stringify(body))]);stream.method=method;stream.url=url;stream.headers={};return stream;}
function tenantRow(permissions){return{membership_id:"423e4567-e89b-42d3-a456-426614174000",organization_id:organizationId,roles:["institution_owner"],permissions};}

test("guardian authority verification requires dedicated permission",async()=>{
 const pool={async query(sql){if(sql.includes("FROM core.organization_memberships"))return{rows:[tenantRow(["academic.students.read","academic.students.update"])]};throw new Error("unexpected query: "+sql);}};
 const res=responseDouble();
 await handleModuleRecordsRequest(request("POST",`/v1/modules/student-guardians/${relationId}/verify`,{
  isLegalGuardian:true,canPickupStudent:true,verificationNote:"Kartu keluarga diperiksa."
 }),res,pool,userId,organizationId);
 assert.equal(res.statusCode,403);
 assert.equal(JSON.parse(res.body).permission,"academic.students.guardians.verify");
});

test("guardian authority verification writes evidence and metadata-only audit atomically",async()=>{
 const calls=[];
 const pool={async query(sql,values=[]){
  calls.push({sql,values});
  if(sql.includes("FROM core.organization_memberships"))return{rows:[tenantRow(["academic.students.guardians.verify"])]};
  if(sql.startsWith("SAVEPOINT")||sql.startsWith("RELEASE SAVEPOINT")||sql.startsWith("ROLLBACK TO SAVEPOINT"))return{rows:[]};
  if(sql.includes("WITH updated AS"))return{rows:[{id:relationId,student_id:"523e4567-e89b-42d3-a456-426614174000",guardian_id:"623e4567-e89b-42d3-a456-426614174000",is_legal_guardian:true,can_pickup_student:false,is_emergency_contact:true,verified_at:new Date(),verified_by:userId,valid_from:"2026-01-01",valid_until:null}]};
  if(sql.startsWith("INSERT INTO audit.audit_events"))return{rows:[]};
  throw new Error("unexpected query: "+sql);
 }};
 const evidence="Kartu keluarga dan surat kuasa diperiksa petugas.";
 const res=responseDouble();
 await handleModuleRecordsRequest(request("POST",`/v1/modules/student-guardians/${relationId}/verify`,{
  isLegalGuardian:true,canPickupStudent:false,verificationNote:evidence
 }),res,pool,userId,organizationId);
 assert.equal(res.statusCode,200);
 const update=calls.find(call=>call.sql.includes("WITH updated AS"));
 assert.ok(update);
 assert.equal(update.values[2],evidence);
 const auditStart=update.sql.indexOf("INSERT INTO audit.audit_events");
 assert.ok(auditStart>=0);
 const auditSql=update.sql.slice(auditStart);
 assert.ok(auditSql.includes("'student.guardian.authority.verify'"));
 assert.ok(auditSql.includes("'academic.student_guardians'"));
 assert.ok(auditSql.includes("'evidenceNoteProvided',true"));
 assert.equal(auditSql.includes("$3"),false,"evidence note must not enter audit metadata");
 assert.ok(calls.some(call=>call.sql.startsWith("RELEASE SAVEPOINT")));
});

test("guardian verification rejects missing evidence and malformed authority flags",async()=>{
 const pool={async query(sql){if(sql.includes("FROM core.organization_memberships"))return{rows:[tenantRow(["academic.students.guardians.verify"])]};throw new Error("unexpected query: "+sql);}};
 const res=responseDouble();
 await handleModuleRecordsRequest(request("POST",`/v1/modules/student-guardians/${relationId}/verify`,{
  isLegalGuardian:true,canPickupStudent:true,verificationNote:"ok"
 }),res,pool,userId,organizationId);
 assert.equal(res.statusCode,422);
 assert.equal(JSON.parse(res.body).error,"guardian_verification_requires_explicit_authority_flags_and_evidence_note");
});
