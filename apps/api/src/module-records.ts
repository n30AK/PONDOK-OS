import type { IncomingMessage, ServerResponse } from "node:http";
import type { Pool } from "pg";
import { loadTenantContext } from "./tenant-access.js";

type Field = { column: string; kind?: "text" | "date" | "uuid" | "number" | "boolean" | "json" | "array" | "timestamp"; required?: boolean; max?: number };
type Resource = { table: string; permission: string; writePermission?: string; fields: Record<string, Field>; order?: string; limit?: number; actorColumn?: string };
type Json = Record<string, unknown>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const RESOURCES: Record<string, Resource> = {
  "campuses": { table: "core.campuses", permission: "core.campus.manage", fields: { code:{column:"code",required:true,max:32}, name:{column:"name",required:true,max:160}, campusType:{column:"campus_type",max:24}, status:{column:"status",max:24} } },
  "academic-years": { table: "academic.academic_years", permission: "academic.classes.write", fields: { code:{column:"code",required:true,max:32}, name:{column:"name",required:true,max:120}, startsOn:{column:"starts_on",kind:"date",required:true}, endsOn:{column:"ends_on",kind:"date",required:true}, status:{column:"status",max:24} } },
  "academic-terms": { table: "academic.academic_terms", permission: "academic.classes.write", fields: { academicYearId:{column:"academic_year_id",kind:"uuid",required:true}, code:{column:"code",required:true,max:32}, name:{column:"name",required:true,max:120}, startsOn:{column:"starts_on",kind:"date",required:true}, endsOn:{column:"ends_on",kind:"date",required:true}, status:{column:"status",max:24} } },
  "programs": { table: "academic.programs", permission: "academic.classes.write", fields: { code:{column:"code",required:true,max:32}, name:{column:"name",required:true,max:120}, description:{column:"description",max:1000}, status:{column:"status",max:24} } },
  "subjects": { table: "academic.subjects", permission: "academic.classes.write", fields: { code:{column:"code",required:true,max:32}, name:{column:"name",required:true,max:120}, subjectType:{column:"subject_type",max:32}, status:{column:"status",max:24} } },
  "classes": { table: "academic.class_groups", permission: "academic.classes.write", fields: { campusId:{column:"campus_id",kind:"uuid",required:true}, academicYearId:{column:"academic_year_id",kind:"uuid",required:true}, programId:{column:"program_id",kind:"uuid",required:true}, code:{column:"code",required:true,max:32}, name:{column:"name",required:true,max:120}, capacity:{column:"capacity",kind:"number"}, status:{column:"status",max:24} } },
  "enrollments": { table: "academic.enrollments", permission: "academic.enrollments.write", fields: { studentId:{column:"student_id",kind:"uuid",required:true}, academicYearId:{column:"academic_year_id",kind:"uuid",required:true}, classGroupId:{column:"class_group_id",kind:"uuid"}, enrolledOn:{column:"enrolled_on",kind:"date"}, endedOn:{column:"ended_on",kind:"date"}, status:{column:"status",max:24} } },
  "attendance-sessions": { table: "academic.attendance_sessions", actorColumn: "recorded_by", permission: "academic.attendance.write", fields: { classGroupId:{column:"class_group_id",kind:"uuid",required:true}, sessionDate:{column:"session_date",kind:"date",required:true}, sessionLabel:{column:"session_label",max:80}, status:{column:"status",max:24} } },
  "attendance-records": { table: "academic.attendance_records", order: "recorded_at", permission: "academic.attendance.write", fields: { attendanceSessionId:{column:"attendance_session_id",kind:"uuid",required:true}, studentId:{column:"student_id",kind:"uuid",required:true}, attendanceStatus:{column:"attendance_status",required:true,max:24}, note:{column:"note",max:500} } },
  "dormitories": { table: "boarding.dormitories", permission: "boarding.rooms.manage", fields: { campusId:{column:"campus_id",kind:"uuid"}, dormitoryCode:{column:"dormitory_code",required:true,max:32}, dormitoryName:{column:"dormitory_name",required:true,max:120}, genderPolicy:{column:"gender_policy",required:true,max:24}, isActive:{column:"is_active",kind:"boolean"} } },
  "boarding-rooms": { table: "boarding.rooms", order: "id", permission: "boarding.rooms.manage", fields: { dormitoryId:{column:"dormitory_id",kind:"uuid",required:true}, roomCode:{column:"room_code",required:true,max:32}, floorLabel:{column:"floor_label",max:40}, capacity:{column:"capacity",kind:"number",required:true}, isActive:{column:"is_active",kind:"boolean"} } },
  "boarding-beds": { table: "boarding.beds", order: "id", permission: "boarding.rooms.manage", fields: { roomId:{column:"room_id",kind:"uuid",required:true}, bedCode:{column:"bed_code",required:true,max:32}, bedStatus:{column:"bed_status",max:24} } },
  "boarding-assignments": { table: "boarding.bed_assignments", actorColumn: "assigned_by", permission: "boarding.assignments.manage", fields: { bedId:{column:"bed_id",kind:"uuid",required:true}, studentId:{column:"student_id",kind:"uuid",required:true}, assignedFrom:{column:"assigned_from",kind:"date",required:true}, assignedUntil:{column:"assigned_until",kind:"date"} } },
  "leave-requests": { table: "boarding.leave_requests", permission: "boarding.leave.read", writePermission: "boarding.leave.decide", fields: { studentId:{column:"student_id",kind:"uuid",required:true}, requestedFrom:{column:"requested_from",kind:"timestamp",required:true}, requestedUntil:{column:"requested_until",kind:"timestamp",required:true}, destination:{column:"destination",max:240}, reason:{column:"reason",required:true,max:1000} } },
  "incidents": { table: "boarding.incidents", actorColumn: "recorded_by", permission: "boarding.incidents.write", fields: { studentId:{column:"student_id",kind:"uuid",required:true}, incidentType:{column:"incident_type",required:true,max:80}, severity:{column:"severity",required:true,max:24}, description:{column:"description",required:true,max:2000}, occurredAt:{column:"occurred_at",kind:"timestamp",required:true} } },
  "library-catalog": { table: "library.catalog_items", permission: "library.catalog.write", fields: { isbn:{column:"isbn",max:24}, itemCode:{column:"item_code",required:true,max:48}, title:{column:"title",required:true,max:240}, subtitle:{column:"subtitle",max:240}, authors:{column:"authors",kind:"array"}, publisher:{column:"publisher",max:160}, publicationYear:{column:"publication_year",kind:"number"}, category:{column:"category",max:80}, languageCode:{column:"language_code",max:8}, isReferenceOnly:{column:"is_reference_only",kind:"boolean"}, isActive:{column:"is_active",kind:"boolean"} } },
  "library-copies": { table: "library.copies", permission: "library.catalog.write", fields: { catalogItemId:{column:"catalog_item_id",kind:"uuid",required:true}, campusId:{column:"campus_id",kind:"uuid"}, barcode:{column:"barcode",required:true,max:64}, shelfLocation:{column:"shelf_location",max:80}, copyStatus:{column:"copy_status",max:24}, acquiredOn:{column:"acquired_on",kind:"date"} } },
  "library-loans": { table: "library.loans", actorColumn: "issued_by", permission: "library.loans.write", fields: { copyId:{column:"copy_id",kind:"uuid",required:true}, borrowerType:{column:"borrower_type",required:true,max:24}, borrowerId:{column:"borrower_id",kind:"uuid",required:true}, dueAt:{column:"due_at",kind:"timestamp",required:true} } },
  "cms-pages": { table: "cms.pages", permission: "cms.pages.manage", fields: { campusId:{column:"campus_id",kind:"uuid"}, slug:{column:"slug",required:true,max:120}, title:{column:"title",required:true,max:240}, excerpt:{column:"excerpt",max:500}, bodyMarkdown:{column:"body_markdown",required:true,max:30000}, pageStatus:{column:"page_status",max:24}, seoTitle:{column:"seo_title",max:240}, seoDescription:{column:"seo_description",max:320} } },
  "announcements": { table: "cms.announcements", permission: "cms.announcements.manage", fields: { campusId:{column:"campus_id",kind:"uuid"}, title:{column:"title",required:true,max:240}, summary:{column:"summary",max:500}, bodyMarkdown:{column:"body_markdown",required:true,max:12000}, audience:{column:"audience",required:true,max:24}, announcementStatus:{column:"announcement_status",max:24}, publishAt:{column:"publish_at",kind:"timestamp"}, expireAt:{column:"expire_at",kind:"timestamp"} } },
  "contacts": { table: "crm.contacts", permission: "crm.contacts.write", fields: { contactType:{column:"contact_type",required:true,max:32}, displayName:{column:"display_name",required:true,max:180}, email:{column:"email",max:254}, phone:{column:"phone",max:32}, organizationName:{column:"organization_name",max:180}, consentStatus:{column:"consent_status",required:true,max:24} } },
  "interactions": { table: "crm.interactions", actorColumn: "recorded_by", permission: "crm.contacts.write", fields: { contactId:{column:"contact_id",kind:"uuid",required:true}, channel:{column:"channel",required:true,max:32}, subject:{column:"subject",required:true,max:180}, notes:{column:"notes",max:2000}, interactionAt:{column:"interaction_at",kind:"timestamp"} } },
  "donor-pledges": { table: "crm.donor_pledges", permission: "crm.donations.manage", fields: { contactId:{column:"contact_id",kind:"uuid",required:true}, pledgeReference:{column:"pledge_reference",required:true,max:64}, pledgedAmount:{column:"pledged_amount",kind:"number",required:true}, currencyCode:{column:"currency_code",max:3}, pledgedOn:{column:"pledged_on",kind:"date"}, expectedOn:{column:"expected_on",kind:"date"}, pledgeStatus:{column:"pledge_status",max:24}, notes:{column:"notes",max:1000} } },
  "assets": { table: "assets.asset_register", permission: "assets.register.write", fields: { campusId:{column:"campus_id",kind:"uuid"}, assetCode:{column:"asset_code",required:true,max:48}, assetName:{column:"asset_name",required:true,max:180}, category:{column:"category",required:true,max:80}, acquisitionDate:{column:"acquisition_date",kind:"date"}, acquisitionCost:{column:"acquisition_cost",kind:"number"}, usefulLifeMonths:{column:"useful_life_months",kind:"number"}, assetStatus:{column:"asset_status",max:24}, locationLabel:{column:"location_label",max:180} } },
  "suppliers": { table: "procurement.suppliers", permission: "procurement.suppliers.manage", fields: { supplierCode:{column:"supplier_code",required:true,max:48}, supplierName:{column:"supplier_name",required:true,max:180}, taxNumber:{column:"tax_number",max:40}, email:{column:"email",max:254}, phone:{column:"phone",max:32}, address:{column:"address",kind:"json"} } },
  "purchase-requests": { table: "procurement.purchase_requests", permission: "procurement.requests.write", fields: { campusId:{column:"campus_id",kind:"uuid"}, requestNumber:{column:"request_number",required:true,max:48}, requestDate:{column:"request_date",kind:"date"}, requiredBy:{column:"required_by",kind:"date"}, purpose:{column:"purpose",required:true,max:1000} } },
  "purchase-orders": { table: "procurement.purchase_orders", permission: "procurement.orders.manage", fields: { supplierId:{column:"supplier_id",kind:"uuid",required:true}, requestId:{column:"request_id",kind:"uuid"}, orderNumber:{column:"order_number",required:true,max:48}, orderedOn:{column:"ordered_on",kind:"date"}, expectedOn:{column:"expected_on",kind:"date"}, totalAmount:{column:"total_amount",kind:"number"} } }
};

function reply(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" });
  res.end(JSON.stringify(body));
}
async function readJson(req: IncomingMessage): Promise<Json | null> {
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of req) { const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk); size += part.length; if (size > 32_768) return null; chunks.push(part); }
  try { const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8")); return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Json : null; } catch { return null; }
}
function validDate(value: string): boolean {
  if (!DATE.test(value)) return false;
  const [y,m,d] = value.split("-").map(Number); const date = new Date(Date.UTC(y ?? 0,(m ?? 1)-1,d ?? 0));
  return date.getUTCFullYear()===y && date.getUTCMonth()===(m ?? 1)-1 && date.getUTCDate()===d;
}
function validate(fields: Resource["fields"], body: Json): string | null {
  for (const key of Object.keys(body)) if (!fields[key]) return "unsupported_field";
  for (const [key, field] of Object.entries(fields)) {
    const value = body[key];
    if (field.required && (value === undefined || value === null || value === "")) return `required_${key}`;
    if (value === undefined || value === null || value === "") continue;
    if (field.kind === "uuid" && (typeof value !== "string" || !UUID.test(value))) return `invalid_${key}`;
    if (field.kind === "date" && (typeof value !== "string" || !validDate(value))) return `invalid_${key}`;
    if (field.kind === "timestamp" && (typeof value !== "string" || Number.isNaN(Date.parse(value)))) return `invalid_${key}`;
    if (field.kind === "number" && (typeof value !== "number" || !Number.isFinite(value) || value < 0)) return `invalid_${key}`;
    if (field.kind === "boolean" && typeof value !== "boolean") return `invalid_${key}`;
    if (field.kind === "array" && (!Array.isArray(value) || value.length > 30 || value.some((item) => typeof item !== "string" || item.length > 120))) return `invalid_${key}`;
    if (field.kind === "json" && (typeof value !== "object" || Array.isArray(value))) return `invalid_${key}`;
    if ((!field.kind || field.kind === "text") && (typeof value !== "string" || value.length > (field.max ?? 500))) return `invalid_${key}`;
  }
  if (body.email && typeof body.email === "string" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) return "invalid_email";
  if (body.startsOn && body.endsOn && String(body.startsOn) > String(body.endsOn)) return "invalid_date_range";
  if (body.opensAt && body.closesAt && Date.parse(String(body.opensAt)) >= Date.parse(String(body.closesAt))) return "invalid_date_range";
  return null;
}

export async function handleModuleRecordsRequest(req: IncomingMessage, res: ServerResponse, pool: Pick<Pool, "query">, userId: string, organizationId: string): Promise<boolean> {
  const url = new URL(req.url ?? "/", "http://localhost");
  const match = url.pathname.match(/^\/v1\/modules\/([a-z-]+)$/);
  if (!match) return false;
  if (req.method !== "GET" && req.method !== "POST") { res.setHeader("allow", "GET, POST"); reply(res,405,{error:"method_not_allowed"}); return true; }
  const resource = RESOURCES[match[1] ?? ""];
  if (!resource) { reply(res,404,{error:"module_resource_not_found"}); return true; }
  const tenant = await loadTenantContext(pool,userId,organizationId);
  if (!tenant) { reply(res,403,{error:"active_membership_required"}); return true; }
  const write = req.method === "POST";
  const requiredPermission = req.method === "POST" ? (resource.writePermission ?? resource.permission) : resource.permission;
  if (!tenant.permissions.includes(requiredPermission)) { reply(res,403,{error:"permission_required",permission:requiredPermission}); return true; }
  if (!write) {
    const limitRaw=Number(url.searchParams.get("limit") ?? String(resource.limit ?? 100));
    const limit=Number.isInteger(limitRaw)?Math.min(Math.max(limitRaw,1),200):100;
    const result=await pool.query(`SELECT * FROM ${resource.table} WHERE organization_id=$1::uuid ORDER BY ${resource.order ?? "created_at"} DESC LIMIT $2`,[organizationId,limit]);
    reply(res,200,{data:result.rows,pagination:{limit,returned:result.rows.length}}); return true;
  }
  const body=await readJson(req);
  if (!body) { reply(res,400,{error:"invalid_json_or_body_too_large"}); return true; }
  const error=validate(resource.fields,body);
  if (error) { reply(res,422,{error}); return true; }
  const entries=Object.entries(resource.fields).filter(([key])=>Object.prototype.hasOwnProperty.call(body,key));
  const columns=["organization_id",...entries.map(([,field])=>field.column),...(resource.actorColumn?[resource.actorColumn]:[])];
  const values=[organizationId,...entries.map(([key,field])=>field.kind==="json"?JSON.stringify(body[key]):body[key]),...(resource.actorColumn?[userId]:[])];
  const placeholders=values.map((_,i)=>{ const kind=i===0|| (resource.actorColumn&&i===values.length-1)?"uuid":entries[i-1]?.[1].kind; return `${i+1}${kind==="uuid"?"::uuid":kind==="date"?"::date":kind==="timestamp"?"::timestamptz":kind==="json"?"::jsonb":""}`; });
  try {
    const result=await pool.query(`INSERT INTO ${resource.table} (${columns.join(",")}) VALUES (${placeholders.join(",")}) RETURNING *`,values);
    const record = result.rows[0] as Record<string, unknown>;
    await pool.query(`INSERT INTO audit.audit_events (organization_id, actor_user_id, action, resource_type, resource_id, metadata) VALUES ($1::uuid,$2::uuid,$3,$4,$5,$6::jsonb)`, [organizationId,userId,"module.record.create",resource.table,String(record.id ?? ""),JSON.stringify({ resource: match[1] })]);
    reply(res,201,{data:record});
  } catch (reason) {
    const code=typeof reason==="object"&&reason!==null&&"code" in reason?String((reason as {code:unknown}).code):"";
    reply(res,code==="23505"?409:code==="23503"?422:code==="23514"?422:500,{error:code==="23505"?"duplicate_record":code==="23503"?"related_record_not_found_in_tenant":code==="23514"?"record_constraint_rejected":"module_record_create_failed"});
  }
  return true;
}
