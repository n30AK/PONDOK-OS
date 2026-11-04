import type { IncomingMessage, ServerResponse } from "node:http";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { Pool } from "pg";
import { loadTenantContext } from "./tenant-access.js";

type Field = { column: string; kind?: "text" | "date" | "uuid" | "number" | "boolean" | "json" | "array" | "timestamp"; required?: boolean; max?: number; values?: string[]; minValue?: number; maxValue?: number; integer?: boolean };
type Resource = { table: string; permission: string; writePermission?: string; fields: Record<string, Field>; order?: string; limit?: number; actorColumn?: string };
type Json = Record<string, unknown>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const RESOURCES: Record<string, Resource> = {
  "campuses": { table: "core.campuses", permission: "academic.classes.read", writePermission: "core.campus.manage", fields: { code:{column:"code",required:true,max:32}, name:{column:"name",required:true,max:160}, campusType:{column:"campus_type",max:24,values:["main","branch","unit"]}, status:{column:"status",max:24,values:["active","inactive"]} } },
  "student-details": { table: "academic.student_profiles", permission: "academic.students.read", writePermission: "academic.students.update", fields: { campusId:{column:"campus_id",kind:"uuid",required:true}, studentNumber:{column:"student_number",required:true,max:48}, legalName:{column:"legal_name",required:true,max:180}, preferredName:{column:"preferred_name",max:180}, birthDate:{column:"birth_date",kind:"date"}, birthPlace:{column:"birth_place",max:120}, genderCode:{column:"gender_code",max:24,values:["male","female","unspecified"]}, citizenshipCode:{column:"citizenship_code",max:2}, nationalStudentNumber:{column:"national_student_number",max:32}, entryDate:{column:"entry_date",kind:"date"}, previousSchoolName:{column:"previous_school_name",max:180}, currentAddress:{column:"current_address",kind:"json"}, permanentAddress:{column:"permanent_address",kind:"json"}, primaryPhone:{column:"primary_phone",max:32}, primaryEmail:{column:"primary_email",max:254}, photoObjectKey:{column:"photo_object_key",max:512}, status:{column:"status",max:24,values:["applicant","active","graduated","withdrawn","suspended"]} } },
  "instructor-profiles": { table: "academic.instructors", permission: "hr.educators.read", writePermission: "hr.educators.write", fields: { employeeId:{column:"employee_id",kind:"uuid",required:true}, educatorNumber:{column:"educator_number",max:48}, educatorType:{column:"educator_type",required:true,max:24,values:["teacher","ustadz","musyrif","lecturer","trainer","counselor","other"]}, highestQualification:{column:"highest_qualification",max:120}, specialization:{column:"specialization",max:240}, certificationSummary:{column:"certification_summary",max:2000}, teachingExperienceYears:{column:"teaching_experience_years",kind:"number",minValue:0,maxValue:80}, employmentCategory:{column:"employment_category",max:80}, isActive:{column:"is_active",kind:"boolean"} } },
  "employee-assignments": { table: "hr.employee_assignments", permission: "hr.organization.read", writePermission: "hr.organization.write", fields: { employeeId:{column:"employee_id",kind:"uuid",required:true}, departmentId:{column:"department_id",kind:"uuid"}, positionId:{column:"position_id",kind:"uuid"}, managerEmployeeId:{column:"manager_employee_id",kind:"uuid"}, assignmentType:{column:"assignment_type",max:24,values:["primary","secondary","acting","project","temporary"]}, startsOn:{column:"starts_on",kind:"date",required:true}, endsOn:{column:"ends_on",kind:"date"}, isPrimary:{column:"is_primary",kind:"boolean"}, decisionReference:{column:"decision_reference",max:160} } },
  "academic-years": { table: "academic.academic_years", permission: "academic.classes.read", writePermission: "academic.classes.write", fields: { code:{column:"code",required:true,max:32}, name:{column:"name",required:true,max:120}, startsOn:{column:"starts_on",kind:"date",required:true}, endsOn:{column:"ends_on",kind:"date",required:true}, status:{column:"status",max:24,values:["planned","active","closed"]} } },
  "academic-terms": { table: "academic.academic_terms", permission: "academic.classes.read", writePermission: "academic.classes.write", fields: { academicYearId:{column:"academic_year_id",kind:"uuid",required:true}, code:{column:"code",required:true,max:32}, name:{column:"name",required:true,max:120}, startsOn:{column:"starts_on",kind:"date",required:true}, endsOn:{column:"ends_on",kind:"date",required:true}, status:{column:"status",max:24,values:["planned","active","closed"]} } },
  "programs": { table: "academic.programs", permission: "academic.classes.read", writePermission: "academic.classes.write", fields: { code:{column:"code",required:true,max:32}, name:{column:"name",required:true,max:120}, description:{column:"description",max:1000}, status:{column:"status",max:24,values:["active","inactive"]} } },
  "subjects": { table: "academic.subjects", permission: "academic.classes.read", writePermission: "academic.classes.write", fields: { code:{column:"code",required:true,max:32}, name:{column:"name",required:true,max:120}, subjectType:{column:"subject_type",max:32,values:["general","religious","language","vocational","other"]}, status:{column:"status",max:24,values:["active","inactive"]} } },
  "classes": { table: "academic.class_groups", permission: "academic.classes.read", writePermission: "academic.classes.write", fields: { campusId:{column:"campus_id",kind:"uuid",required:true}, academicYearId:{column:"academic_year_id",kind:"uuid",required:true}, programId:{column:"program_id",kind:"uuid",required:true}, code:{column:"code",required:true,max:32}, name:{column:"name",required:true,max:120}, capacity:{column:"capacity",kind:"number",minValue:1,integer:true}, status:{column:"status",max:24,values:["active","inactive"]} } },
  "enrollments": { table: "academic.enrollments", permission: "academic.enrollments.read", writePermission: "academic.enrollments.write", fields: { studentId:{column:"student_id",kind:"uuid",required:true}, academicYearId:{column:"academic_year_id",kind:"uuid",required:true}, classGroupId:{column:"class_group_id",kind:"uuid"}, enrolledOn:{column:"enrolled_on",kind:"date"}, endedOn:{column:"ended_on",kind:"date"}, status:{column:"status",max:24,values:["enrolled","completed","transferred","withdrawn"]} } },
  "attendance-sessions": { table: "academic.attendance_sessions", actorColumn: "recorded_by", permission: "academic.attendance.read", writePermission: "academic.attendance.write", fields: { classGroupId:{column:"class_group_id",kind:"uuid",required:true}, sessionDate:{column:"session_date",kind:"date",required:true}, sessionLabel:{column:"session_label",max:80}, status:{column:"status",max:24,values:["open"]} } },
  "attendance-records": { table: "academic.attendance_records", order: "recorded_at", permission: "academic.attendance.read", writePermission: "academic.attendance.write", fields: { attendanceSessionId:{column:"attendance_session_id",kind:"uuid",required:true}, studentId:{column:"student_id",kind:"uuid",required:true}, attendanceStatus:{column:"attendance_status",required:true,max:24,values:["present","excused","sick","absent","late"]}, note:{column:"note",max:500} } },
  "dormitories": { table: "boarding.dormitories", permission: "boarding.rooms.manage", fields: { campusId:{column:"campus_id",kind:"uuid"}, dormitoryCode:{column:"dormitory_code",required:true,max:32}, dormitoryName:{column:"dormitory_name",required:true,max:120}, genderPolicy:{column:"gender_policy",required:true,max:24,values:["male","female","mixed"]}, isActive:{column:"is_active",kind:"boolean"} } },
  "boarding-rooms": { table: "boarding.rooms", order: "id", permission: "boarding.rooms.manage", fields: { dormitoryId:{column:"dormitory_id",kind:"uuid",required:true}, roomCode:{column:"room_code",required:true,max:32}, floorLabel:{column:"floor_label",max:40}, capacity:{column:"capacity",kind:"number",required:true,minValue:1,maxValue:100,integer:true}, isActive:{column:"is_active",kind:"boolean"} } },
  "boarding-beds": { table: "boarding.beds", order: "id", permission: "boarding.rooms.manage", fields: { roomId:{column:"room_id",kind:"uuid",required:true}, bedCode:{column:"bed_code",required:true,max:32}, bedStatus:{column:"bed_status",max:24,values:["available"]} } },
  "boarding-assignments": { table: "boarding.bed_assignments", actorColumn: "assigned_by", permission: "boarding.assignments.manage", fields: { bedId:{column:"bed_id",kind:"uuid",required:true}, studentId:{column:"student_id",kind:"uuid",required:true}, assignedFrom:{column:"assigned_from",kind:"date",required:true}, assignedUntil:{column:"assigned_until",kind:"date"} } },
  "leave-requests": { table: "boarding.leave_requests", permission: "boarding.leave.read", writePermission: "boarding.leave.decide", fields: { studentId:{column:"student_id",kind:"uuid",required:true}, requestedFrom:{column:"requested_from",kind:"timestamp",required:true}, requestedUntil:{column:"requested_until",kind:"timestamp",required:true}, destination:{column:"destination",max:240}, reason:{column:"reason",required:true,max:1000} } },
  "incidents": { table: "boarding.incidents", actorColumn: "recorded_by", permission: "boarding.incidents.read", writePermission: "boarding.incidents.write", fields: { studentId:{column:"student_id",kind:"uuid",required:true}, incidentType:{column:"incident_type",required:true,max:80,values:["guidance","discipline","safety","health_referral","other"]}, severity:{column:"severity",required:true,max:24,values:["low","medium","high","critical"]}, description:{column:"description",required:true,max:2000}, occurredAt:{column:"occurred_at",kind:"timestamp",required:true} } },
  "library-catalog": { table: "library.catalog_items", permission: "library.catalog.read", writePermission: "library.catalog.write", fields: { isbn:{column:"isbn",max:24}, itemCode:{column:"item_code",required:true,max:48}, title:{column:"title",required:true,max:240}, subtitle:{column:"subtitle",max:240}, authors:{column:"authors",kind:"array"}, publisher:{column:"publisher",max:160}, publicationYear:{column:"publication_year",kind:"number",minValue:1400,maxValue:2200,integer:true}, category:{column:"category",max:80}, languageCode:{column:"language_code",max:8}, isReferenceOnly:{column:"is_reference_only",kind:"boolean"}, isActive:{column:"is_active",kind:"boolean"} } },
  "library-copies": { table: "library.copies", permission: "library.catalog.read", writePermission: "library.catalog.write", fields: { catalogItemId:{column:"catalog_item_id",kind:"uuid",required:true}, campusId:{column:"campus_id",kind:"uuid"}, barcode:{column:"barcode",required:true,max:64}, shelfLocation:{column:"shelf_location",max:80}, copyStatus:{column:"copy_status",max:24,values:["available"]}, acquiredOn:{column:"acquired_on",kind:"date"} } },
  "library-loans": { table: "library.loans", actorColumn: "issued_by", permission: "library.loans.read", writePermission: "library.loans.write", fields: { copyId:{column:"copy_id",kind:"uuid",required:true}, borrowerType:{column:"borrower_type",required:true,max:24,values:["student"]}, borrowerId:{column:"borrower_id",kind:"uuid",required:true}, dueAt:{column:"due_at",kind:"timestamp",required:true} } },
  "cms-pages": { table: "cms.pages", permission: "cms.pages.manage", fields: { campusId:{column:"campus_id",kind:"uuid"}, slug:{column:"slug",required:true,max:120}, title:{column:"title",required:true,max:240}, excerpt:{column:"excerpt",max:500}, bodyMarkdown:{column:"body_markdown",required:true,max:30000}, pageStatus:{column:"page_status",max:24,values:["draft"]}, seoTitle:{column:"seo_title",max:240}, seoDescription:{column:"seo_description",max:320} } },
  "announcements": { table: "cms.announcements", permission: "cms.announcements.manage", fields: { campusId:{column:"campus_id",kind:"uuid"}, title:{column:"title",required:true,max:240}, summary:{column:"summary",max:500}, bodyMarkdown:{column:"body_markdown",required:true,max:12000}, audience:{column:"audience",required:true,max:24,values:["public","parents","students","staff","internal"]}, announcementStatus:{column:"announcement_status",max:24,values:["draft"]}, publishAt:{column:"publish_at",kind:"timestamp"}, expireAt:{column:"expire_at",kind:"timestamp"} } },
  "contacts": { table: "crm.contacts", permission: "crm.contacts.read", writePermission: "crm.contacts.write", fields: { contactType:{column:"contact_type",required:true,max:32,values:["guardian","alumni","donor","partner","prospect","other"]}, displayName:{column:"display_name",required:true,max:180}, email:{column:"email",max:254}, phone:{column:"phone",max:32}, organizationName:{column:"organization_name",max:180}, consentStatus:{column:"consent_status",required:true,max:24,values:["unknown"]} } },
  "interactions": { table: "crm.interactions", actorColumn: "recorded_by", permission: "crm.contacts.read", writePermission: "crm.contacts.write", fields: { contactId:{column:"contact_id",kind:"uuid",required:true}, channel:{column:"channel",required:true,max:32,values:["phone","email","whatsapp","meeting","letter","other"]}, subject:{column:"subject",required:true,max:180}, notes:{column:"notes",max:2000}, interactionAt:{column:"interaction_at",kind:"timestamp"} } },
  "donor-pledges": { table: "crm.donor_pledges", permission: "crm.donations.manage", fields: { contactId:{column:"contact_id",kind:"uuid",required:true}, pledgeReference:{column:"pledge_reference",required:true,max:64}, pledgedAmount:{column:"pledged_amount",kind:"number",required:true,minValue:0.01}, currencyCode:{column:"currency_code",max:3}, pledgedOn:{column:"pledged_on",kind:"date"}, expectedOn:{column:"expected_on",kind:"date"}, pledgeStatus:{column:"pledge_status",max:24,values:["pledged"]}, notes:{column:"notes",max:1000} } },
  "assets": { table: "assets.asset_register", permission: "assets.register.read", writePermission: "assets.register.write", fields: { campusId:{column:"campus_id",kind:"uuid"}, assetCode:{column:"asset_code",required:true,max:48}, assetName:{column:"asset_name",required:true,max:180}, category:{column:"category",required:true,max:80}, acquisitionDate:{column:"acquisition_date",kind:"date"}, acquisitionCost:{column:"acquisition_cost",kind:"number"}, usefulLifeMonths:{column:"useful_life_months",kind:"number",minValue:1,integer:true}, assetStatus:{column:"asset_status",max:24,values:["active"]}, locationLabel:{column:"location_label",max:180} } },
  "suppliers": { table: "procurement.suppliers", permission: "procurement.suppliers.manage", fields: { supplierCode:{column:"supplier_code",required:true,max:48}, supplierName:{column:"supplier_name",required:true,max:180}, taxNumber:{column:"tax_number",max:40}, email:{column:"email",max:254}, phone:{column:"phone",max:32}, address:{column:"address",kind:"json"} } },
  "purchase-requests": { table: "procurement.purchase_requests", actorColumn: "requested_by", permission: "procurement.requests.read", writePermission: "procurement.requests.write", fields: { campusId:{column:"campus_id",kind:"uuid"}, requestNumber:{column:"request_number",required:true,max:48}, requestDate:{column:"request_date",kind:"date"}, requiredBy:{column:"required_by",kind:"date"}, purpose:{column:"purpose",required:true,max:1000} } },
  "academic-class-subjects": { table: "academic.class_subjects", permission: "academic.classes.read", writePermission: "academic.classes.write", fields: { classGroupId:{column:"class_group_id",kind:"uuid",required:true}, subjectId:{column:"subject_id",kind:"uuid",required:true}, weeklyPeriods:{column:"weekly_periods",kind:"number",minValue:1,maxValue:30,integer:true} } },
  "guardians": { table: "academic.guardians", permission: "academic.students.read", writePermission: "academic.students.create", fields: { displayName:{column:"display_name",required:true,max:180}, relationshipDefault:{column:"relationship_default",max:40}, phonePrimary:{column:"phone_primary",max:32}, phoneAlternate:{column:"phone_alternate",max:32}, email:{column:"email",max:254}, occupation:{column:"occupation",max:120}, address:{column:"address",kind:"json"}, preferredContactChannel:{column:"preferred_contact_channel",max:24,values:["whatsapp","phone","email","letter","none"]}, consentStatus:{column:"consent_status",max:24,values:["pending","granted","withdrawn","not_required"]} } },
  "student-guardians": { table: "academic.student_guardians", permission: "academic.students.read", writePermission: "academic.students.update", fields: { studentId:{column:"student_id",kind:"uuid",required:true}, guardianId:{column:"guardian_id",kind:"uuid",required:true}, relationshipCode:{column:"relationship_code",required:true,max:40}, isPrimary:{column:"is_primary",kind:"boolean"}, isLegalGuardian:{column:"is_legal_guardian",kind:"boolean"}, isEmergencyContact:{column:"is_emergency_contact",kind:"boolean"}, canPickupStudent:{column:"can_pickup_student",kind:"boolean"}, validFrom:{column:"valid_from",kind:"date"}, validUntil:{column:"valid_until",kind:"date"}, verificationNote:{column:"verification_note",max:500} } },
  "employees": { table: "hr.employees", permission: "hr.employees.read", writePermission: "hr.employees.write", fields: { campusId:{column:"campus_id",kind:"uuid"}, employeeNumber:{column:"employee_number",required:true,max:48}, legalName:{column:"legal_name",required:true,max:180}, preferredName:{column:"preferred_name",max:180}, email:{column:"email",max:254}, phone:{column:"phone",max:32}, joinedOn:{column:"joined_on",kind:"date",required:true}, employmentStatus:{column:"employment_status",max:24,values:["active","on_leave","resigned","terminated","retired"]} } },
  "hr-departments": { table: "hr.departments", permission: "hr.organization.read", writePermission: "hr.organization.write", fields: { departmentCode:{column:"department_code",required:true,max:32}, departmentName:{column:"department_name",required:true,max:120}, parentDepartmentId:{column:"parent_department_id",kind:"uuid"}, headEmployeeId:{column:"head_employee_id",kind:"uuid"}, campusId:{column:"campus_id",kind:"uuid"}, effectiveFrom:{column:"effective_from",kind:"date"}, effectiveUntil:{column:"effective_until",kind:"date"}, isActive:{column:"is_active",kind:"boolean"} } },
  "hr-positions": { table: "hr.positions", permission: "hr.organization.read", writePermission: "hr.organization.write", fields: { positionCode:{column:"position_code",required:true,max:32}, positionName:{column:"position_name",required:true,max:120}, departmentId:{column:"department_id",kind:"uuid"}, parentPositionId:{column:"parent_position_id",kind:"uuid"}, jobFamily:{column:"job_family",max:100}, positionLevel:{column:"position_level",kind:"number",minValue:1,maxValue:20,integer:true}, jobDescription:{column:"job_description",max:3000}, approvalScope:{column:"approval_scope",kind:"json"}, isActive:{column:"is_active",kind:"boolean"} } },
  "hr-contracts": { table: "hr.employment_contracts", permission: "hr.contracts.read", writePermission: "hr.contracts.write", fields: { employeeId:{column:"employee_id",kind:"uuid",required:true}, positionId:{column:"position_id",kind:"uuid"}, contractType:{column:"contract_type",required:true,max:24,values:["permanent","fixed_term","part_time","honorary","volunteer"]}, startsOn:{column:"starts_on",kind:"date",required:true}, endsOn:{column:"ends_on",kind:"date"}, baseSalary:{column:"base_salary",kind:"number",required:true,minValue:0}, currencyCode:{column:"currency_code",max:3,values:["IDR"]}, status:{column:"status",max:24,values:["draft"]} } },
  "hr-payroll-periods": { table: "hr.payroll_periods", permission: "hr.payroll.read", writePermission: "hr.payroll.prepare", fields: { periodCode:{column:"period_code",required:true,max:32}, startsOn:{column:"starts_on",kind:"date",required:true}, endsOn:{column:"ends_on",kind:"date",required:true}, payDate:{column:"pay_date",kind:"date",required:true}, status:{column:"status",max:16,values:["open"]} } },
  "hr-payroll-runs": { table: "hr.payroll_runs", permission: "hr.payroll.read", writePermission: "hr.payroll.prepare", fields: { payrollPeriodId:{column:"payroll_period_id",kind:"uuid",required:true}, runNumber:{column:"run_number",required:true,max:48}, runType:{column:"run_type",max:24,values:["regular","bonus","adjustment"]}, status:{column:"status",max:24,values:["draft"]} } },
  "purchase-request-lines": { table: "procurement.purchase_request_lines", order: "id", permission: "procurement.requests.read", writePermission: "procurement.requests.write", fields: { requestId:{column:"request_id",kind:"uuid",required:true}, description:{column:"description",required:true,max:500}, quantity:{column:"quantity",kind:"number",required:true,minValue:0.001}, estimatedUnitCost:{column:"estimated_unit_cost",kind:"number",minValue:0} } },
  "purchase-order-lines": { table: "procurement.purchase_order_lines", order: "id", permission: "procurement.orders.manage", writePermission: "procurement.orders.manage", fields: { purchaseOrderId:{column:"purchase_order_id",kind:"uuid",required:true}, description:{column:"description",required:true,max:500}, quantity:{column:"quantity",kind:"number",required:true,minValue:0.001}, unitCost:{column:"unit_cost",kind:"number",required:true,minValue:0} } },
  "asset-events": { table: "assets.asset_events", order: "occurred_at", actorColumn: "recorded_by", permission: "assets.register.read", writePermission: "assets.register.write", fields: { assetId:{column:"asset_id",kind:"uuid",required:true}, eventType:{column:"event_type",required:true,max:24,values:["assigned","moved","maintenance","disposed","status_changed","audited"]}, eventData:{column:"event_data",kind:"json"}, occurredAt:{column:"occurred_at",kind:"timestamp"} } },
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
function validate(fields: Resource["fields"], body: Json, partial = false): string | null {
  for (const key of Object.keys(body)) if (!fields[key]) return "unsupported_field";
  for (const [key, field] of Object.entries(fields)) {
    const value = body[key];
    if (!partial && field.required && (value === undefined || value === null || value === "")) return `required_${key}`;
    if (value === undefined || value === null || value === "") continue;
    if (field.kind === "uuid" && (typeof value !== "string" || !UUID.test(value))) return `invalid_${key}`;
    if (field.kind === "date" && (typeof value !== "string" || !validDate(value))) return `invalid_${key}`;
    if (field.kind === "timestamp" && (typeof value !== "string" || Number.isNaN(Date.parse(value)))) return `invalid_${key}`;
    if (field.kind === "number" && (typeof value !== "number" || !Number.isFinite(value) || value < (field.minValue ?? 0) || (field.maxValue !== undefined && value > field.maxValue) || (field.integer && !Number.isInteger(value)))) return `invalid_${key}`;
    if (field.kind === "boolean" && typeof value !== "boolean") return `invalid_${key}`;
    if (field.kind === "array" && (!Array.isArray(value) || value.length > 30 || value.some((item) => typeof item !== "string" || item.length > 120))) return `invalid_${key}`;
    if (field.kind === "json" && (typeof value !== "object" || Array.isArray(value))) return `invalid_${key}`;
    if ((!field.kind || field.kind === "text") && (typeof value !== "string" || value.length > (field.max ?? 500))) return `invalid_${key}`;
    if (field.values && (typeof value !== "string" || !field.values.includes(value))) return `invalid_${key}`;
  }
  if (body.email && typeof body.email === "string" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) return "invalid_email";
  if (body.startsOn && body.endsOn && String(body.startsOn) > String(body.endsOn)) return "invalid_date_range";
  if (body.opensAt && body.closesAt && Date.parse(String(body.opensAt)) >= Date.parse(String(body.closesAt))) return "invalid_date_range";
  if (body.requestedFrom && body.requestedUntil && Date.parse(String(body.requestedUntil)) <= Date.parse(String(body.requestedFrom))) return "invalid_date_range";
  if (body.orderedOn && body.expectedOn && String(body.expectedOn) < String(body.orderedOn)) return "invalid_date_range";
  if (body.requestDate && body.requiredBy && String(body.requiredBy) < String(body.requestDate)) return "invalid_date_range";
  if (body.assignedFrom && body.assignedUntil && String(body.assignedUntil) < String(body.assignedFrom)) return "invalid_date_range";
  return null;
}

export function validateModuleRecordInput(resourceKey: string, body: Json): string | null {
  const resource = RESOURCES[resourceKey];
  if (!resource) return "module_resource_not_found";
  return validate(resource.fields, body);
}

export function validateModuleRecordPatchInput(resourceKey: string, body: Json): string | null {
  const resource = RESOURCES[resourceKey];
  if (!resource) return "module_resource_not_found";
  return validate(resource.fields, body, true);
}

async function handleLibraryLoanReturn(res: ServerResponse, pool: Pick<Pool, "query">, userId: string, organizationId: string, loanId: string): Promise<void> {
  await pool.query("SAVEPOINT library_loan_return");
  try {
    const loanResult = await pool.query("SELECT id, copy_id, loan_status FROM library.loans WHERE organization_id=$1::uuid AND id=$2::uuid FOR UPDATE", [organizationId, loanId]);
    if (!loanResult.rows.length) {
      await pool.query("ROLLBACK TO SAVEPOINT library_loan_return");
      await pool.query("RELEASE SAVEPOINT library_loan_return");
      reply(res, 404, { error: "loan_not_found" }); return;
    }
    const loan = loanResult.rows[0] as { id: string; copy_id: string; loan_status: string };
    if (loan.loan_status !== "open") {
      await pool.query("ROLLBACK TO SAVEPOINT library_loan_return");
      await pool.query("RELEASE SAVEPOINT library_loan_return");
      reply(res, 409, { error: "loan_not_open" }); return;
    }
    const copyResult = await pool.query("SELECT id, copy_status FROM library.copies WHERE organization_id=$1::uuid AND id=$2::uuid FOR UPDATE", [organizationId, loan.copy_id]);
    if (!copyResult.rows.length || (copyResult.rows[0] as { copy_status: string }).copy_status !== "on_loan") {
      await pool.query("ROLLBACK TO SAVEPOINT library_loan_return");
      await pool.query("RELEASE SAVEPOINT library_loan_return");
      reply(res, 409, { error: "copy_not_on_loan" }); return;
    }
    const returned = await pool.query("UPDATE library.loans SET loan_status='returned', returned_at=now(), received_by=$1::uuid WHERE organization_id=$2::uuid AND id=$3::uuid AND loan_status='open' RETURNING *", [userId, organizationId, loanId]);
    await pool.query("UPDATE library.copies SET copy_status='available' WHERE organization_id=$1::uuid AND id=$2::uuid", [organizationId, loan.copy_id]);
    await pool.query("INSERT INTO audit.audit_events (organization_id, actor_user_id, action, resource_type, resource_id, metadata) VALUES ($1::uuid,$2::uuid,$3,$4,$5,$6::jsonb)", [organizationId, userId, "library.loan.return", "library.loans", loanId, JSON.stringify({ copyId: loan.copy_id })]);
    await pool.query("RELEASE SAVEPOINT library_loan_return");
    reply(res, 200, { data: returned.rows[0] });
  } catch (reason) {
    await pool.query("ROLLBACK TO SAVEPOINT library_loan_return").catch(() => undefined);
    await pool.query("RELEASE SAVEPOINT library_loan_return").catch(() => undefined);
    const code = typeof reason === "object" && reason !== null && "code" in reason ? String((reason as { code: unknown }).code) : "";
    reply(res, code === "23503" ? 422 : 500, { error: code === "23503" ? "related_record_not_found_in_tenant" : "library_loan_return_failed" });
  }
}

async function createLibraryLoan(res: ServerResponse, pool: Pick<Pool, "query">, userId: string, organizationId: string, body: Json): Promise<void> {
  const error = validateModuleRecordInput("library-loans", body);
  if (error) { reply(res, 422, { error }); return; }
  const copyId = String(body.copyId), borrowerId = String(body.borrowerId), dueAt = String(body.dueAt);
  await pool.query("SAVEPOINT library_loan_issue");
  try {
    const copyResult = await pool.query(`SELECT c.id, c.copy_status, ci.is_reference_only, ci.is_active
      FROM library.copies c JOIN library.catalog_items ci ON ci.organization_id=c.organization_id AND ci.id=c.catalog_item_id
      WHERE c.organization_id=$1::uuid AND c.id=$2::uuid FOR UPDATE OF c`, [organizationId, copyId]);
    if (!copyResult.rows.length) {
      await pool.query("ROLLBACK TO SAVEPOINT library_loan_issue"); await pool.query("RELEASE SAVEPOINT library_loan_issue");
      reply(res, 404, { error: "library_copy_not_found" }); return;
    }
    const copy = copyResult.rows[0] as { copy_status: string; is_reference_only: boolean; is_active: boolean };
    if (copy.copy_status !== "available" || copy.is_reference_only || !copy.is_active) {
      await pool.query("ROLLBACK TO SAVEPOINT library_loan_issue"); await pool.query("RELEASE SAVEPOINT library_loan_issue");
      reply(res, 409, { error: "library_copy_unavailable" }); return;
    }
    const borrower = await pool.query("SELECT id FROM academic.student_profiles WHERE organization_id=$1::uuid AND id=$2::uuid AND status='active'", [organizationId, borrowerId]);
    if (!borrower.rows.length) {
      await pool.query("ROLLBACK TO SAVEPOINT library_loan_issue"); await pool.query("RELEASE SAVEPOINT library_loan_issue");
      reply(res, 422, { error: "active_student_borrower_required" }); return;
    }
    const updatedCopy = await pool.query("UPDATE library.copies SET copy_status='on_loan' WHERE organization_id=$1::uuid AND id=$2::uuid AND copy_status='available' RETURNING id", [organizationId, copyId]);
    if (!updatedCopy.rows.length) {
      await pool.query("ROLLBACK TO SAVEPOINT library_loan_issue"); await pool.query("RELEASE SAVEPOINT library_loan_issue");
      reply(res, 409, { error: "library_copy_unavailable" }); return;
    }
    const loan = await pool.query("INSERT INTO library.loans (organization_id, copy_id, borrower_type, borrower_id, due_at, issued_by) VALUES ($1::uuid,$2::uuid,'student',$3::uuid,$4::timestamptz,$5::uuid) RETURNING *", [organizationId, copyId, borrowerId, dueAt, userId]);
    const loanId = String((loan.rows[0] as { id: string }).id);
    await pool.query("INSERT INTO audit.audit_events (organization_id, actor_user_id, action, resource_type, resource_id, metadata) VALUES ($1::uuid,$2::uuid,$3,$4,$5,$6::jsonb)", [organizationId, userId, "library.loan.issue", "library.loans", loanId, JSON.stringify({ copyId, borrowerType: "student", borrowerId })]);
    await pool.query("RELEASE SAVEPOINT library_loan_issue");
    reply(res, 201, { data: loan.rows[0] });
  } catch (reason) {
    await pool.query("ROLLBACK TO SAVEPOINT library_loan_issue").catch(() => undefined);
    await pool.query("RELEASE SAVEPOINT library_loan_issue").catch(() => undefined);
    const code = typeof reason === "object" && reason !== null && "code" in reason ? String((reason as { code: unknown }).code) : "";
    reply(res, code === "23505" ? 409 : code === "23503" || code === "23514" ? 422 : 500, { error: code === "23505" ? "duplicate_record" : code === "23503" ? "related_record_not_found_in_tenant" : code === "23514" ? "record_constraint_rejected" : "library_loan_issue_failed" });
  }
}


type HealthRow = {
  id: string; student_id: string; blood_group_ciphertext: Buffer | null;
  allergy_data_ciphertext: Buffer | null; medical_history_ciphertext: Buffer | null;
  medication_data_ciphertext: Buffer | null; emergency_instructions_ciphertext: Buffer | null;
  encryption_key_version: string | null; created_at: Date; updated_at: Date; legal_name?: string;
};

function getStudentHealthKey(): { key: Buffer; version: string } | null {
  const encoded = process.env.STUDENT_HEALTH_ENCRYPTION_KEY ?? "";
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) return null;
  return { key, version: process.env.STUDENT_HEALTH_ENCRYPTION_KEY_VERSION ?? "v1" };
}

function encryptHealthValue(value: unknown, key: Buffer): Buffer | null {
  if (value === undefined || value === null || value === "") return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(Buffer.from(JSON.stringify(value), "utf8")), cipher.final()]);
  return Buffer.concat([Buffer.from([1]), iv, cipher.getAuthTag(), encrypted]);
}

function decryptHealthValue(value: Buffer | null, key: Buffer): unknown {
  if (!value) return null;
  if (value.length < 30 || value[0] !== 1) throw new Error("unsupported_health_ciphertext");
  const iv = value.subarray(1, 13);
  const tag = value.subarray(13, 29);
  const ciphertext = value.subarray(29);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  return JSON.parse(plain) as unknown;
}

function serializeHealthRow(row: HealthRow, key: Buffer): Record<string, unknown> {
  return {
    id: row.id,
    student_id: row.student_id,
    legal_name: row.legal_name ?? null,
    blood_group: decryptHealthValue(row.blood_group_ciphertext, key),
    allergy_data: decryptHealthValue(row.allergy_data_ciphertext, key),
    medical_history: decryptHealthValue(row.medical_history_ciphertext, key),
    medication_data: decryptHealthValue(row.medication_data_ciphertext, key),
    emergency_instructions: decryptHealthValue(row.emergency_instructions_ciphertext, key),
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

async function handleStudentHealthProfiles(
  req: IncomingMessage, res: ServerResponse, pool: Pick<Pool, "query">,
  userId: string, organizationId: string, url: URL
): Promise<void> {
  const tenant = await loadTenantContext(pool, userId, organizationId);
  if (!tenant) { reply(res, 403, { error: "active_membership_required" }); return; }
  const write = req.method !== "GET";
  const requiredPermission = write ? "academic.students.health.write" : "academic.students.health.read";
  if (!tenant.permissions.includes(requiredPermission)) {
    reply(res, 403, { error: "permission_required", permission: requiredPermission }); return;
  }
  const crypto = getStudentHealthKey();
  if (!crypto) {
    reply(res, 503, { error: "student_health_encryption_not_configured", required: "STUDENT_HEALTH_ENCRYPTION_KEY (base64-encoded 32-byte key)" }); return;
  }
  const keyVersion = crypto.version;
  if (req.method === "GET") {
    const studentId = url.searchParams.get("studentId");
    if (studentId && !UUID.test(studentId)) { reply(res, 400, { error: "valid_student_id_required" }); return; }
    const result = await pool.query<HealthRow>(
      `SELECT hp.id, hp.student_id, hp.blood_group_ciphertext, hp.allergy_data_ciphertext,
        hp.medical_history_ciphertext, hp.medication_data_ciphertext,
        hp.emergency_instructions_ciphertext, hp.encryption_key_version,
        hp.created_at, hp.updated_at, sp.legal_name
       FROM academic.student_health_profiles hp
       JOIN academic.student_profiles sp ON sp.organization_id=hp.organization_id AND sp.id=hp.student_id
       WHERE hp.organization_id=$1::uuid AND ($2::uuid IS NULL OR hp.student_id=$2::uuid)
       ORDER BY sp.legal_name LIMIT 200`,
      [organizationId, studentId]
    );
    try {
      for (const row of result.rows) {
        if (row.encryption_key_version !== keyVersion) throw new Error("student_health_key_version_mismatch");
      }
      reply(res, 200, { data: result.rows.map(row => serializeHealthRow(row, crypto.key)) });
    } catch {
      reply(res, 503, { error: "student_health_decryption_failed_check_key_version" });
    }
    return;
  }
  if (req.method !== "POST" && req.method !== "PATCH") {
    res.setHeader("allow", "GET, POST, PATCH"); reply(res, 405, { error: "method_not_allowed" }); return;
  }
  const body = await readJson(req);
  if (!body) { reply(res, 400, { error: "invalid_json_or_body_too_large" }); return; }
  const allowed = new Set(["studentId", "bloodGroup", "allergyData", "medicalHistory", "medicationData", "emergencyInstructions"]);
  if (Object.keys(body).some(key => !allowed.has(key))) { reply(res, 422, { error: "unsupported_health_field" }); return; }
  const bloodGroups = new Set(["A+","A-","B+","B-","AB+","AB-","O+","O-","unknown"]);
  if (body.bloodGroup !== undefined && body.bloodGroup !== null && body.bloodGroup !== "" && !bloodGroups.has(String(body.bloodGroup))) {
    reply(res, 422, { error: "invalid_blood_group" }); return;
  }
  const recordId = url.searchParams.get("id");
  let studentId = typeof body.studentId === "string" ? body.studentId : "";
  if (req.method === "PATCH") {
    if (!recordId || !UUID.test(recordId)) { reply(res, 400, { error: "valid_record_id_required" }); return; }
    const existing = await pool.query<{ student_id: string; encryption_key_version: string }>(
      "SELECT student_id, encryption_key_version FROM academic.student_health_profiles WHERE organization_id=$1::uuid AND id=$2::uuid",
      [organizationId, recordId]
    );
    if (!existing.rows.length) { reply(res, 404, { error: "record_not_found" }); return; }
    if (studentId && studentId !== existing.rows[0]!.student_id) { reply(res, 422, { error: "student_id_immutable" }); return; }
    if (existing.rows[0]!.encryption_key_version !== keyVersion) { reply(res, 503, { error: "student_health_key_version_mismatch" }); return; }
    studentId = existing.rows[0]!.student_id;
  }
  if (!UUID.test(studentId)) { reply(res, 422, { error: "valid_student_id_required" }); return; }
  const columns: Array<[string,string]> = [
    ["bloodGroup","blood_group_ciphertext"],["allergyData","allergy_data_ciphertext"],
    ["medicalHistory","medical_history_ciphertext"],["medicationData","medication_data_ciphertext"],
    ["emergencyInstructions","emergency_instructions_ciphertext"]
  ];
  const submitted = columns.filter(([key]) => Object.prototype.hasOwnProperty.call(body, key));
  if (req.method === "PATCH" && submitted.length === 0) { reply(res, 400, { error: "no_mutable_fields" }); return; }
  const values = submitted.map(([key]) => encryptHealthValue(body[key], crypto.key));
  await pool.query("SAVEPOINT student_health_write");
  try {
    let result;
    if (req.method === "POST") {
      const allColumns = columns;
      const encrypted = allColumns.map(([key]) => encryptHealthValue(body[key], crypto.key));
      result = await pool.query<HealthRow>(
        `INSERT INTO academic.student_health_profiles
          (organization_id, student_id, blood_group_ciphertext, allergy_data_ciphertext,
           medical_history_ciphertext, medication_data_ciphertext, emergency_instructions_ciphertext, encryption_key_version)
         VALUES ($1::uuid,$2::uuid,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (organization_id, student_id) DO UPDATE SET
           blood_group_ciphertext=EXCLUDED.blood_group_ciphertext,
           allergy_data_ciphertext=EXCLUDED.allergy_data_ciphertext,
           medical_history_ciphertext=EXCLUDED.medical_history_ciphertext,
           medication_data_ciphertext=EXCLUDED.medication_data_ciphertext,
           emergency_instructions_ciphertext=EXCLUDED.emergency_instructions_ciphertext,
           encryption_key_version=EXCLUDED.encryption_key_version, updated_at=now()
         RETURNING id, student_id, blood_group_ciphertext, allergy_data_ciphertext, medical_history_ciphertext,
           medication_data_ciphertext, emergency_instructions_ciphertext, encryption_key_version, created_at, updated_at`,
        [organizationId, studentId, ...encrypted, keyVersion]
      );
    } else {
      const sets = submitted.map(([, column], index) => `${column}=${index+1}`);
      sets.push(`encryption_key_version=${submitted.length+1}`, "updated_at=now()");
      result = await pool.query<HealthRow>(
        `UPDATE academic.student_health_profiles SET ${sets.join(",")}
         WHERE organization_id=${submitted.length+2}::uuid AND id=${submitted.length+3}::uuid
         RETURNING id, student_id, blood_group_ciphertext, allergy_data_ciphertext, medical_history_ciphertext,
           medication_data_ciphertext, emergency_instructions_ciphertext, encryption_key_version, created_at, updated_at`,
        [...values, keyVersion, organizationId, recordId]
      );
    }
    const row = result.rows[0];
    if (!row) { await pool.query("ROLLBACK TO SAVEPOINT student_health_write"); await pool.query("RELEASE SAVEPOINT student_health_write"); reply(res,404,{error:"record_not_found"}); return; }
    await pool.query(
      "INSERT INTO audit.audit_events (organization_id, actor_user_id, action, resource_type, resource_id, metadata) VALUES ($1::uuid,$2::uuid,$3,$4,$5,$6::jsonb)",
      [organizationId,userId,"student.health_profile.write","academic.student_health_profiles",row.id,JSON.stringify({ fields: submitted.map(([key]) => key), encryptionKeyVersion: keyVersion })]
    );
    await pool.query("RELEASE SAVEPOINT student_health_write");
    reply(res, req.method === "POST" ? 201 : 200, { data: serializeHealthRow(row, crypto.key) });
  } catch (reason) {
    await pool.query("ROLLBACK TO SAVEPOINT student_health_write").catch(() => undefined);
    await pool.query("RELEASE SAVEPOINT student_health_write").catch(() => undefined);
    const code = typeof reason === "object" && reason !== null && "code" in reason ? String((reason as {code:unknown}).code) : "";
    reply(res, code === "23503" ? 422 : code === "23505" ? 409 : 500, { error: code === "23503" ? "related_record_not_found_in_tenant" : code === "23505" ? "duplicate_record" : "student_health_write_failed" });
  }
}

export async function handleModuleRecordsRequest(req: IncomingMessage, res: ServerResponse, pool: Pick<Pool, "query">, userId: string, organizationId: string): Promise<boolean> {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (url.pathname === "/v1/modules/student-health-profiles") {
    await handleStudentHealthProfiles(req, res, pool, userId, organizationId, url);
    return true;
  }
  const returnMatch = url.pathname.match(/^\/v1\/modules\/library-loans\/([0-9a-f-]{36})\/return$/i);
  if (returnMatch) {
    if (req.method !== "POST") { res.setHeader("allow", "POST"); reply(res,405,{error:"method_not_allowed"}); return true; }
    const tenant = await loadTenantContext(pool,userId,organizationId);
    if (!tenant) { reply(res,403,{error:"active_membership_required"}); return true; }
    if (!tenant.permissions.includes("library.loans.write")) { reply(res,403,{error:"permission_required",permission:"library.loans.write"}); return true; }
    const loanId = returnMatch[1] ?? "";
    if (!UUID.test(loanId)) { reply(res,400,{error:"valid_record_id_required"}); return true; }
    await handleLibraryLoanReturn(res,pool,userId,organizationId,loanId);
    return true;
  }
  const match = url.pathname.match(/^\/v1\/modules\/([a-z-]+)$/);
  if (!match) return false;
  if (req.method !== "GET" && req.method !== "POST" && req.method !== "PATCH") { res.setHeader("allow", "GET, POST, PATCH"); reply(res,405,{error:"method_not_allowed"}); return true; }
  if (match[1] === "student-options") {
    if (req.method !== "GET") { res.setHeader("allow","GET"); reply(res,405,{error:"method_not_allowed"}); return true; }
    const tenant = await loadTenantContext(pool,userId,organizationId);
    if (!tenant) { reply(res,403,{error:"active_membership_required"}); return true; }
    const allowed = ["academic.students.read","boarding.rooms.manage","library.loans.write"].some(permission=>tenant.permissions.includes(permission));
    if (!allowed) { reply(res,403,{error:"permission_required"}); return true; }
    const result = await pool.query(
      `SELECT id, student_number AS "studentNumber", legal_name AS "legalName"
       FROM academic.student_profiles WHERE organization_id=$1::uuid AND status IN ('active','applicant')
       ORDER BY legal_name LIMIT 200`, [organizationId],
    );
    reply(res,200,{data:result.rows}); return true;
  }
  const resource = RESOURCES[match[1] ?? ""];
  if (!resource) { reply(res,404,{error:"module_resource_not_found"}); return true; }
  const tenant = await loadTenantContext(pool,userId,organizationId);
  if (!tenant) { reply(res,403,{error:"active_membership_required"}); return true; }
  const write = req.method !== "GET";
  const requiredPermission = write ? (resource.writePermission ?? resource.permission) : resource.permission;
  if (!tenant.permissions.includes(requiredPermission)) { reply(res,403,{error:"permission_required",permission:requiredPermission}); return true; }
  if (!write) {
    const limitRaw=Number(url.searchParams.get("limit") ?? String(resource.limit ?? 100));
    const limit=Number.isInteger(limitRaw)?Math.min(Math.max(limitRaw,1),200):100;
    const result=await pool.query(`SELECT * FROM ${resource.table} WHERE organization_id=$1::uuid ORDER BY ${resource.order ?? "created_at"} DESC LIMIT $2`,[organizationId,limit]);
    reply(res,200,{data:result.rows,pagination:{limit,returned:result.rows.length}}); return true;
  }
  const body=await readJson(req);
  if (!body) { reply(res,400,{error:"invalid_json_or_body_too_large"}); return true; }
  const recordId=url.searchParams.get("id");
  if (req.method === "PATCH") {
    if (!recordId || !UUID.test(recordId)) { reply(res,400,{error:"valid_record_id_required"}); return true; }
    const error=validate(resource.fields,body,true);
    if (error) { reply(res,422,{error}); return true; }
    const entries=Object.entries(resource.fields).filter(([key])=>Object.prototype.hasOwnProperty.call(body,key));
    if (!entries.length) { reply(res,400,{error:"no_mutable_fields"}); return true; }
    const sets=entries.map(([,field],i)=>{const kind=field.kind;const suffix=kind==="uuid"?"::uuid":kind==="date"?"::date":kind==="timestamp"?"::timestamptz":kind==="json"?"::jsonb":"";return `${field.column}=${i+1}${suffix}`;});
    const values=entries.map(([key,field])=>field.kind==="json"?JSON.stringify(body[key]):body[key]);
    values.push(organizationId,recordId);
    await pool.query("SAVEPOINT module_record_write");
    try {
      const result=await pool.query(`UPDATE ${resource.table} SET ${sets.join(",")} WHERE organization_id=${values.length-1}::uuid AND id=${values.length}::uuid RETURNING *`,values);
      if (!result.rows.length) { reply(res,404,{error:"record_not_found"}); return true; }
      const record=result.rows[0] as Record<string,unknown>;
      await pool.query(`INSERT INTO audit.audit_events (organization_id, actor_user_id, action, resource_type, resource_id, metadata) VALUES ($1::uuid,$2::uuid,$3,$4,$5,$6::jsonb)`,[organizationId,userId,"module.record.update",resource.table,String(record.id ?? ""),JSON.stringify({resource:match[1],fields:entries.map(([key])=>key)})]);
      await pool.query("RELEASE SAVEPOINT module_record_write");
      reply(res,200,{data:record});
    } catch(reason) {
      await pool.query("ROLLBACK TO SAVEPOINT module_record_write").catch(() => undefined);
      await pool.query("RELEASE SAVEPOINT module_record_write").catch(() => undefined);
      const code=typeof reason==="object"&&reason!==null&&"code" in reason?String((reason as {code:unknown}).code):"";
      reply(res,code==="23505"?409:code==="23503"?422:code==="23514"?422:500,{error:code==="23505"?"duplicate_record":code==="23503"?"related_record_not_found_in_tenant":code==="23514"?"record_constraint_rejected":"module_record_update_failed"});
    }
    return true;
  }
  if (match[1] === "library-loans") {
    await createLibraryLoan(res,pool,userId,organizationId,body);
    return true;
  }
  const error=validateModuleRecordInput(match[1] ?? "",body);
  if (error) { reply(res,422,{error}); return true; }
  const entries=Object.entries(resource.fields).filter(([key])=>Object.prototype.hasOwnProperty.call(body,key));
  const columns=["organization_id",...entries.map(([,field])=>field.column),...(resource.actorColumn?[resource.actorColumn]:[])];
  const values=[organizationId,...entries.map(([key,field])=>field.kind==="json"?JSON.stringify(body[key]):body[key]),...(resource.actorColumn?[userId]:[])];
  const placeholders=values.map((_,i)=>{ const kind=i===0 || (Boolean(resource.actorColumn) && i===values.length-1) ? "uuid" : entries[i-1]?.[1].kind; const suffix=kind==="uuid"?"::uuid":kind==="date"?"::date":kind==="timestamp"?"::timestamptz":kind==="json"?"::jsonb":""; return "$"+String(i+1)+suffix; });
  await pool.query("SAVEPOINT module_record_write");
  try {
    const result=await pool.query(`INSERT INTO ${resource.table} (${columns.join(",")}) VALUES (${placeholders.join(",")}) RETURNING *`,values);
    const record = result.rows[0] as Record<string, unknown>;
    await pool.query(`INSERT INTO audit.audit_events (organization_id, actor_user_id, action, resource_type, resource_id, metadata) VALUES ($1::uuid,$2::uuid,$3,$4,$5,$6::jsonb)`, [organizationId,userId,"module.record.create",resource.table,String(record.id ?? ""),JSON.stringify({ resource: match[1] })]);
    await pool.query("RELEASE SAVEPOINT module_record_write");
    reply(res,201,{data:record});
  } catch (reason) {
    await pool.query("ROLLBACK TO SAVEPOINT module_record_write").catch(() => undefined);
    await pool.query("RELEASE SAVEPOINT module_record_write").catch(() => undefined);
    const code=typeof reason==="object"&&reason!==null&&"code" in reason?String((reason as {code:unknown}).code):"";
    reply(res,code==="23505"?409:code==="23503"?422:code==="23514"?422:500,{error:code==="23505"?"duplicate_record":code==="23503"?"related_record_not_found_in_tenant":code==="23514"?"record_constraint_rejected":"module_record_create_failed"});
  }
  return true;
}
