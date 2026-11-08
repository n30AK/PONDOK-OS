import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { createCipheriv, randomBytes } from "node:crypto";
import { handleModuleRecordsRequest } from "../dist/module-records.js";

const userId = "123e4567-e89b-42d3-a456-426614174000";
const organizationId = "223e4567-e89b-42d3-a456-426614174000";
const recordId = "323e4567-e89b-42d3-a456-426614174000";
function responseDouble() {
  return { statusCode: 0, headers: {}, body: "", writeHead(status, headers) { this.statusCode=status; this.headers=headers; }, setHeader(name,value) { this.headers[name]=value; }, end(body) { this.body=body??""; } };
}
function request(method,url,body) {
  const stream=Readable.from(body===undefined?[]:[Buffer.from(JSON.stringify(body))]);
  stream.method=method; stream.url=url; stream.headers={}; return stream;
}
function tenantRow(permissions) {
  return { membership_id:"423e4567-e89b-42d3-a456-426614174000", organization_id:organizationId, roles:["institution_owner"], permissions };
}

test("stores student identity document numbers as ciphertext and writes metadata-only audit", async () => {
  const previousKey=process.env.STUDENT_IDENTITY_ENCRYPTION_KEY;
  const previousVersion=process.env.STUDENT_IDENTITY_ENCRYPTION_KEY_VERSION;
  process.env.STUDENT_IDENTITY_ENCRYPTION_KEY=Buffer.alloc(32,7).toString("base64");
  process.env.STUDENT_IDENTITY_ENCRYPTION_KEY_VERSION="identity-test-v1";
  const calls=[];
  const pool={async query(sql,values=[]) {
    calls.push({sql,values});
    if(sql.includes("FROM core.organization_memberships")) return {rows:[tenantRow(["academic.students.identity.read","academic.students.identity.write"])]};
    if(sql.startsWith("SAVEPOINT")||sql.startsWith("RELEASE SAVEPOINT")||sql.startsWith("ROLLBACK TO SAVEPOINT")) return {rows:[]};
    if(sql.startsWith("INSERT INTO academic.student_identity_documents")) return {rows:[{
      id:recordId,student_id:userId,document_type:"nik",document_number_ciphertext:values[3],
      encryption_key_version:values[4],issuer:"Dukcapil",issued_on:"2020-01-01",
      expires_on:null,verified_at:null,created_at:new Date()
    }]};
    if(sql.startsWith("INSERT INTO audit.audit_events")) return {rows:[]};
    throw new Error("unexpected query: "+sql);
  }};
  try {
    const res=responseDouble();
    await handleModuleRecordsRequest(request("POST","/v1/modules/student-identity-documents",{
      studentId:userId,documentType:"nik",documentNumber:"3201010101010001",issuer:"Dukcapil",issuedOn:"2020-01-01"
    }),res,pool,userId,organizationId);
    assert.equal(res.statusCode,201);
    const insert=calls.find(call=>call.sql.startsWith("INSERT INTO academic.student_identity_documents"));
    assert.ok(Buffer.isBuffer(insert.values[3]));
    assert.equal(insert.values[3].toString("utf8").includes("3201010101010001"),false);
    const audit=calls.find(call=>call.sql.startsWith("INSERT INTO audit.audit_events"));
    assert.ok(audit);
    assert.equal(JSON.stringify(audit.values).includes("3201010101010001"),false);
    assert.equal(JSON.parse(res.body).data.document_number,"3201010101010001");
  } finally {
    if(previousKey===undefined) delete process.env.STUDENT_IDENTITY_ENCRYPTION_KEY; else process.env.STUDENT_IDENTITY_ENCRYPTION_KEY=previousKey;
    if(previousVersion===undefined) delete process.env.STUDENT_IDENTITY_ENCRYPTION_KEY_VERSION; else process.env.STUDENT_IDENTITY_ENCRYPTION_KEY_VERSION=previousVersion;
  }
});

test("fails closed when identity document access audit cannot be written", async () => {
  const previousKey=process.env.STUDENT_IDENTITY_ENCRYPTION_KEY;
  const previousVersion=process.env.STUDENT_IDENTITY_ENCRYPTION_KEY_VERSION;
  process.env.STUDENT_IDENTITY_ENCRYPTION_KEY=Buffer.alloc(32,7).toString("base64");
  process.env.STUDENT_IDENTITY_ENCRYPTION_KEY_VERSION="identity-test-v1";
  const pool={async query(sql) {
    if(sql.includes("FROM core.organization_memberships")) return {rows:[tenantRow(["academic.students.identity.read"])]};
    if(sql.includes("FROM academic.student_identity_documents d")) return {rows:[{
      id:recordId,student_id:userId,document_type:"nik",document_number_ciphertext:Buffer.alloc(40),
      encryption_key_version:"identity-test-v1",issuer:null,issued_on:null,expires_on:null,
      verified_at:null,created_at:new Date(),legal_name:"Santri Uji"
    }]};
    if(sql.startsWith("INSERT INTO audit.audit_events")) throw new Error("audit unavailable");
    throw new Error("unexpected query: "+sql);
  }};
  try {
    const res=responseDouble();
    await handleModuleRecordsRequest(request("GET","/v1/modules/student-identity-documents",undefined),res,pool,userId,organizationId);
    assert.equal(res.statusCode,503);
    assert.equal(JSON.parse(res.body).error,"student_identity_read_or_audit_failed");
    assert.equal(JSON.stringify(JSON.parse(res.body)).includes("Santri Uji"),false);
  } finally {
    if(previousKey===undefined) delete process.env.STUDENT_IDENTITY_ENCRYPTION_KEY; else process.env.STUDENT_IDENTITY_ENCRYPTION_KEY=previousKey;
    if(previousVersion===undefined) delete process.env.STUDENT_IDENTITY_ENCRYPTION_KEY_VERSION; else process.env.STUDENT_IDENTITY_ENCRYPTION_KEY_VERSION=previousVersion;
  }
});
