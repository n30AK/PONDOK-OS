import type { IncomingMessage, ServerResponse } from "node:http";
import type { TenantDatabase } from "./tenant-db.js";

type Client = { query<T = unknown>(sql: string, values?: unknown[]): Promise<{ rows: T[] }>; release(): void };
type Dataset = { key: string; title: string; sql: string };
const domains: Record<string, Dataset[]> = {
  support: [
    { key: "customers", title: "Referensi pelanggan", sql: `SELECT id,customer_code AS "customerCode",display_name AS "displayName" FROM platform.customers WHERE status = 'active' ORDER BY display_name LIMIT 300` },
    { key: "installations", title: "Referensi instalasi", sql: `SELECT id,installation_code AS "installationCode",display_name AS "displayName" FROM platform.installations WHERE status <> 'revoked' ORDER BY display_name LIMIT 300` }, 
    { key: "cases", title: "Tiket dukungan", sql: `SELECT s.id,s.case_number AS "caseNumber",c.display_name AS customer,s.subject,s.severity,s.status,s.source_channel AS "sourceChannel",s.sla_due_at AS "slaDueAt",s.created_at AS "createdAt",s.updated_at AS "updatedAt" FROM platform.support_cases s LEFT JOIN platform.customers c ON c.id=s.customer_id ORDER BY s.created_at DESC LIMIT 100` },
    { key: "incidents", title: "Insiden instalasi", sql: `SELECT i.id,i.incident_number AS "incidentNumber",f.display_name AS installation,i.title,i.severity,i.status,i.detected_at AS "detectedAt",i.resolved_at AS "resolvedAt",i.created_at AS "createdAt" FROM platform.installation_incidents i LEFT JOIN platform.installations f ON f.id=i.installation_id ORDER BY i.created_at DESC LIMIT 100` },
  ],
  fleet: [
    { key: "customers", title: "Referensi pelanggan", sql: `SELECT id,customer_code AS "customerCode",display_name AS "displayName" FROM platform.customers WHERE status = 'active' ORDER BY display_name LIMIT 300` }, 
    { key: "installations", title: "Instalasi klien", sql: `SELECT i.id,i.installation_code AS "installationCode",i.display_name AS "displayName",c.display_name AS customer,i.deployment_mode AS "deploymentMode",i.environment,i.status,i.app_version AS "appVersion",i.connector_version AS "connectorVersion",i.last_heartbeat_at AS "lastHeartbeatAt",i.last_verified_backup_at AS "lastVerifiedBackupAt" FROM platform.installations i JOIN platform.customers c ON c.id=i.customer_id ORDER BY i.updated_at DESC LIMIT 100` },
    { key: "health", title: "Pemeriksaan kesehatan", sql: `SELECT h.id,i.display_name AS installation,h.check_type AS "checkType",h.status,h.score,h.checked_at AS "checkedAt",h.duration_ms AS "durationMs" FROM platform.installation_health_checks h JOIN platform.installations i ON i.id=h.installation_id ORDER BY h.checked_at DESC LIMIT 100` },
    { key: "logs", title: "Log teredaksi", sql: `SELECT l.id,i.display_name AS installation,l.event_time AS "eventTime",l.source,l.severity,l.category,l.event_code AS "eventCode",l.message_redacted AS message,l.environment,l.app_version AS "appVersion" FROM platform.installation_log_events l JOIN platform.installations i ON i.id=l.installation_id ORDER BY l.event_time DESC LIMIT 100` },
  ],
  backup: [
    { key: "installations", title: "Referensi instalasi", sql: `SELECT id,installation_code AS "installationCode",display_name AS "displayName" FROM platform.installations WHERE status <> 'revoked' ORDER BY display_name LIMIT 300` }, 
    { key: "policies", title: "Kebijakan backup", sql: `SELECT p.id,i.display_name AS installation,p.policy_name AS "policyName",p.backup_scope AS "backupScope",p.frequency,p.retention_days AS "retentionDays",p.target_type AS "targetType",p.encryption_required AS "encryptionRequired",p.checksum_required AS "checksumRequired",p.offsite_copy_required AS "offsiteCopyRequired",p.immutable_copy_required AS "immutableCopyRequired",p.recovery_point_objective_minutes AS "rpoMinutes",p.recovery_time_objective_minutes AS "rtoMinutes",p.is_enabled AS "isEnabled",p.approved_at AS "approvedAt" FROM platform.backup_policies p LEFT JOIN platform.installations i ON i.id=p.installation_id ORDER BY p.created_at DESC LIMIT 100` },
    { key: "runs", title: "Riwayat backup & restore test", sql: `SELECT b.id,i.display_name AS installation,b.trigger_type AS "triggerType",b.status,b.started_at AS "startedAt",b.finished_at AS "finishedAt",b.encrypted,b.checksum_algorithm AS "checksumAlgorithm",b.verification_status AS "verificationStatus",b.restore_tested_at AS "restoreTestedAt",b.restore_test_status AS "restoreTestStatus",b.size_bytes AS "sizeBytes",b.failure_code AS "failureCode",b.failure_summary_redacted AS "failureSummary" FROM platform.backup_runs b LEFT JOIN platform.installations i ON i.id=b.installation_id ORDER BY b.created_at DESC LIMIT 100` },
  ],
  warranty: [
    { key: "customers", title: "Referensi pelanggan", sql: `SELECT id,customer_code AS "customerCode",display_name AS "displayName" FROM platform.customers WHERE status = 'active' ORDER BY display_name LIMIT 300` },
    { key: "installations", title: "Referensi instalasi", sql: `SELECT id,installation_code AS "installationCode",display_name AS "displayName" FROM platform.installations WHERE status <> 'revoked' ORDER BY display_name LIMIT 300` },
    { key: "warrantyOptions", title: "Referensi perjanjian garansi", sql: `SELECT id,warranty_number AS "warrantyNumber",status FROM platform.warranty_agreements ORDER BY created_at DESC LIMIT 300` }, 
    { key: "agreements", title: "Perjanjian garansi", sql: `SELECT w.id,w.warranty_number AS "warrantyNumber",c.display_name AS customer,i.display_name AS installation,w.coverage_type AS "coverageType",w.status,w.starts_on AS "startsOn",w.ends_on AS "endsOn",w.response_target_hours AS "responseTargetHours",w.resolution_target_hours AS "resolutionTargetHours",w.terms_version AS "termsVersion",w.approved_at AS "approvedAt" FROM platform.warranty_agreements w JOIN platform.customers c ON c.id=w.customer_id LEFT JOIN platform.installations i ON i.id=w.installation_id ORDER BY w.created_at DESC LIMIT 100` },
    { key: "claims", title: "Klaim garansi", sql: `SELECT w.id,w.claim_number AS "claimNumber",c.display_name AS customer,w.subject,w.severity,w.status,w.eligibility_result AS "eligibilityResult",w.submitted_at AS "submittedAt",w.decided_at AS "decidedAt",w.resolved_at AS "resolvedAt" FROM platform.warranty_claims w JOIN platform.customers c ON c.id=w.customer_id ORDER BY w.created_at DESC LIMIT 100` },
    { key: "repairs", title: "Riwayat perbaikan", sql: `SELECT r.id,r.repair_number AS "repairNumber",c.display_name AS customer,i.display_name AS installation,r.repair_category AS "repairCategory",r.severity,r.status,r.client_visible_summary AS "clientVisibleSummary",r.started_at AS "startedAt",r.finished_at AS "finishedAt",r.downtime_minutes AS "downtimeMinutes",r.billable,r.billable_amount AS "billableAmount",r.invoice_id AS "invoiceId" FROM platform.client_repair_logs r JOIN platform.customers c ON c.id=r.customer_id LEFT JOIN platform.installations i ON i.id=r.installation_id ORDER BY r.created_at DESC LIMIT 100` },
  ],
  reports: [
    { key: "assurance", title: "Laporan assurance klien", sql: `SELECT r.id,r.report_number AS "reportNumber",c.display_name AS customer,i.display_name AS installation,r.period_start AS "periodStart",r.period_end AS "periodEnd",r.status,r.overall_status AS "overallStatus",r.health_score AS "healthScore",r.security_score AS "securityScore",r.backup_score AS "backupScore",r.availability_percent AS "availabilityPercent",r.generated_at AS "generatedAt",r.approved_at AS "approvedAt",r.delivered_at AS "deliveredAt" FROM platform.client_assurance_reports r JOIN platform.customers c ON c.id=r.customer_id LEFT JOIN platform.installations i ON i.id=r.installation_id ORDER BY r.generated_at DESC LIMIT 100` },
    { key: "stakeholder", title: "Laporan layanan stakeholder", sql: `SELECT r.id,r.report_number AS "reportNumber",c.display_name AS customer,r.period_start AS "periodStart",r.period_end AS "periodEnd",r.audience,r.status,r.executive_summary AS "executiveSummary",r.generated_at AS "generatedAt",r.approved_at AS "approvedAt",r.delivered_at AS "deliveredAt" FROM platform.stakeholder_service_reports r JOIN platform.customers c ON c.id=r.customer_id ORDER BY r.generated_at DESC LIMIT 100` },
    { key: "exports", title: "Permintaan ekspor", sql: `SELECT id,report_key AS "reportKey",parameters,status,expires_at AS "expiresAt",created_at AS "createdAt" FROM platform.report_exports ORDER BY created_at DESC LIMIT 100` },
  ],
  agents: [
    { key: "installations", title: "Referensi instalasi", sql: `SELECT id,installation_code AS "installationCode",display_name AS "displayName" FROM platform.installations WHERE status <> 'revoked' ORDER BY display_name LIMIT 300` }, 
    { key: "runs", title: "Riwayat eksekusi agent", sql: `SELECT id,agent_key AS "agentKey",trigger_type AS "triggerType",status,installation_id AS "installationId",summary,estimated_cost AS "estimatedCost",started_at AS "startedAt",finished_at AS "finishedAt",created_at AS "createdAt" FROM platform.agent_runs ORDER BY created_at DESC LIMIT 100` },
    { key: "findings", title: "Temuan keamanan", sql: `SELECT f.id,i.display_name AS installation,f.severity,f.category,f.title,f.status,f.detected_at AS "detectedAt",f.acknowledged_at AS "acknowledgedAt",f.resolved_at AS "resolvedAt" FROM platform.security_findings f LEFT JOIN platform.installations i ON i.id=f.installation_id ORDER BY f.detected_at DESC LIMIT 100` },
    { key: "remoteJobs", title: "Tugas jarak jauh terstruktur", sql: `SELECT id,installation_id AS "installationId",job_type AS "jobType",safety_class AS "safetyClass",status,result_summary AS "resultSummary",expires_at AS "expiresAt",approved_at AS "approvedAt",dispatched_at AS "dispatchedAt",completed_at AS "completedAt",created_at AS "createdAt" FROM platform.remote_jobs ORDER BY created_at DESC LIMIT 100` },
    { key: "approvals", title: "Permintaan persetujuan", sql: `SELECT id,request_type AS "requestType",resource_type AS "resourceType",resource_id AS "resourceId",status,decision_note AS "decisionNote",expires_at AS "expiresAt",decided_at AS "decidedAt",created_at AS "createdAt" FROM platform.approval_requests ORDER BY created_at DESC LIMIT 100` },
  ],
  procurement: [
    { key: "vendors", title: "Vendor master", sql: `SELECT id,vendor_code AS "vendorCode",legal_name AS "legalName",display_name AS "displayName",email,phone,payment_terms_days AS "paymentTermsDays",currency,status,risk_level AS "riskLevel",created_at AS "createdAt" FROM platform.vendors ORDER BY display_name LIMIT 100` },
    { key: "requisitions", title: "Permintaan pembelian", sql: `SELECT id,requisition_number AS "requisitionNumber",requested_by AS "requestedBy",department,purpose,required_on AS "requiredOn",currency,estimated_total AS "estimatedTotal",status,approved_at AS "approvedAt",created_at AS "createdAt" FROM platform.purchase_requisitions ORDER BY created_at DESC LIMIT 100` },
    { key: "rfqs", title: "Request for quotation", sql: `SELECT r.id,r.rfq_number AS "rfqNumber",p.requisition_number AS "requisitionNumber",r.title,r.currency,r.status,r.issued_at AS "issuedAt",r.closes_at AS "closesAt",r.created_at AS "createdAt" FROM platform.request_for_quotations r JOIN platform.purchase_requisitions p ON p.id=r.requisition_id ORDER BY r.created_at DESC LIMIT 100` },
    { key: "purchaseOrders", title: "Purchase order", sql: `SELECT p.id,p.po_number AS "poNumber",v.display_name AS vendor,p.currency,p.grand_total AS "grandTotal",p.ordered_on AS "orderedOn",p.expected_on AS "expectedOn",p.status,p.approved_at AS "approvedAt",p.created_at AS "createdAt" FROM platform.purchase_orders p JOIN platform.vendors v ON v.id=p.vendor_id ORDER BY p.created_at DESC LIMIT 100` },
    { key: "receipts", title: "Penerimaan barang", sql: `SELECT g.id,g.receipt_number AS "receiptNumber",p.po_number AS "poNumber",w.warehouse_name AS warehouse,g.received_at AS "receivedAt",g.status,g.inspected_at AS "inspectedAt",g.delivery_reference AS "deliveryReference" FROM platform.goods_receipts g JOIN platform.purchase_orders p ON p.id=g.purchase_order_id JOIN platform.warehouses w ON w.id=g.warehouse_id ORDER BY g.received_at DESC LIMIT 100` },
  ],
  inventory: [
    { key: "warehouses", title: "Gudang", sql: `SELECT id,warehouse_code AS "warehouseCode",warehouse_name AS "warehouseName",manager_user_id AS "managerUserId",status,created_at AS "createdAt" FROM platform.warehouses ORDER BY warehouse_name LIMIT 100` },
    { key: "stockBalances", title: "Saldo stok dari ledger mutasi", sql: `SELECT w.warehouse_code AS "warehouseCode",w.warehouse_name AS "warehouseName",p.product_code AS "productCode",p.product_name AS "productName",sum(m.quantity_delta) AS "onHandQuantity",max(m.occurred_at) AS "lastMovementAt" FROM platform.stock_movements m JOIN platform.warehouses w ON w.id=m.warehouse_id JOIN platform.product_catalog p ON p.id=m.product_id GROUP BY w.id,w.warehouse_code,w.warehouse_name,p.id,p.product_code,p.product_name HAVING sum(m.quantity_delta)<>0 ORDER BY w.warehouse_name,p.product_name LIMIT 500` },
    { key: "transfers", title: "Transfer antar gudang", sql: `SELECT t.id,t.transfer_number AS "transferNumber",s.warehouse_name AS "sourceWarehouse",d.warehouse_name AS "destinationWarehouse",t.status,t.requested_by AS "requestedBy",t.approved_at AS "approvedAt",t.dispatched_at AS "dispatchedAt",t.received_at AS "receivedAt",t.created_at AS "createdAt" FROM platform.stock_transfers t JOIN platform.warehouses s ON s.id=t.source_warehouse_id JOIN platform.warehouses d ON d.id=t.destination_warehouse_id ORDER BY t.created_at DESC LIMIT 100` },
    { key: "assets", title: "Register aset tetap", sql: `SELECT a.id,a.asset_code AS "assetCode",a.asset_name AS "assetName",a.category,a.serial_number AS "serialNumber",a.acquisition_date AS "acquisitionDate",a.acquisition_cost AS "acquisitionCost",a.residual_value AS "residualValue",a.useful_life_months AS "usefulLifeMonths",w.warehouse_name AS warehouse,a.status,a.created_at AS "createdAt" FROM platform.fixed_assets a LEFT JOIN platform.warehouses w ON w.id=a.warehouse_id ORDER BY a.created_at DESC LIMIT 100` },
    { key: "assetEvents", title: "Riwayat aset", sql: `SELECT e.id,a.asset_code AS "assetCode",a.asset_name AS "assetName",e.event_type AS "eventType",e.event_summary AS "eventSummary",e.occurred_at AS "occurredAt",e.evidence_reference AS "evidenceReference" FROM platform.asset_events e JOIN platform.fixed_assets a ON a.id=e.asset_id ORDER BY e.occurred_at DESC LIMIT 100` },
  ],
  hrd: [
    { key: "departments", title: "Struktur organisasi perusahaan", sql: `SELECT d.id,d.department_code AS "departmentCode",d.department_name AS "departmentName",p.department_name AS "parentDepartment",d.cost_center AS "costCenter",d.status,d.created_at AS "createdAt" FROM platform.company_departments d LEFT JOIN platform.company_departments p ON p.id=d.parent_department_id ORDER BY d.department_name LIMIT 100` },
    { key: "employees", title: "Data pegawai perusahaan", sql: `SELECT id,employee_number AS "employeeNumber",legal_name AS "legalName",preferred_name AS "preferredName",work_email AS "workEmail",work_phone AS "workPhone",employment_type AS "employmentType",employment_status AS "employmentStatus",hire_date AS "hireDate",termination_date AS "terminationDate",created_at AS "createdAt" FROM platform.company_employees ORDER BY legal_name LIMIT 100` },
    { key: "assignments", title: "Jabatan dan penempatan", sql: `SELECT a.id,e.employee_number AS "employeeNumber",e.legal_name AS employee,d.department_name AS department,a.position_title AS "positionTitle",a.employment_grade AS "employmentGrade",a.starts_on AS "startsOn",a.ends_on AS "endsOn",a.is_primary AS "isPrimary" FROM platform.company_employee_assignments a JOIN platform.company_employees e ON e.id=a.employee_id JOIN platform.company_departments d ON d.id=a.department_id ORDER BY a.starts_on DESC LIMIT 100` },
    { key: "attendance", title: "Presensi pegawai", sql: `SELECT a.id,e.employee_number AS "employeeNumber",e.legal_name AS employee,a.work_date AS "workDate",a.check_in_at AS "checkInAt",a.check_out_at AS "checkOutAt",a.attendance_status AS status,a.source,a.note FROM platform.company_attendance_records a JOIN platform.company_employees e ON e.id=a.employee_id ORDER BY a.work_date DESC LIMIT 100` },
    { key: "leave", title: "Cuti dan izin", sql: `SELECT l.id,l.request_number AS "requestNumber",e.employee_number AS "employeeNumber",e.legal_name AS employee,l.leave_type AS "leaveType",l.starts_on AS "startsOn",l.ends_on AS "endsOn",l.requested_days AS "requestedDays",l.status,l.decided_at AS "decidedAt" FROM platform.company_leave_requests l JOIN platform.company_employees e ON e.id=l.employee_id ORDER BY l.created_at DESC LIMIT 100` },
    { key: "payroll", title: "Periode dan proses payroll", sql: `SELECT p.id,p.period_code AS "periodCode",p.starts_on AS "startsOn",p.ends_on AS "endsOn",p.payment_date AS "paymentDate",p.status,r.run_number AS "runNumber",r.status AS "runStatus",r.employee_count AS "employeeCount",r.gross_total AS "grossTotal",r.deduction_total AS "deductionTotal",r.net_total AS "netTotal",r.approved_at AS "approvedAt",r.paid_at AS "paidAt" FROM platform.company_payroll_periods p LEFT JOIN platform.company_payroll_runs r ON r.payroll_period_id=p.id ORDER BY p.starts_on DESC LIMIT 100` },
    { key: "payrollItems", title: "Rincian payroll pegawai", sql: `SELECT i.id,p.period_code AS "periodCode",e.employee_number AS "employeeNumber",e.legal_name AS employee,i.basic_pay AS "basicPay",i.allowances,i.overtime_pay AS "overtimePay",i.gross_pay AS "grossPay",i.tax_withheld AS "taxWithheld",i.bpjs_employee AS "bpjsEmployee",i.bpjs_employer AS "bpjsEmployer",i.other_deductions AS "otherDeductions",i.net_pay AS "netPay" FROM platform.company_payroll_items i JOIN platform.company_payroll_runs r ON r.id=i.payroll_run_id JOIN platform.company_payroll_periods p ON p.id=r.payroll_period_id JOIN platform.company_employees e ON e.id=i.employee_id ORDER BY p.starts_on DESC,e.legal_name LIMIT 100` },
  ],
  internal: [
    { key: "departments", title: "Referensi departemen", sql: `SELECT id,department_code AS "departmentCode",department_name AS "departmentName" FROM platform.company_departments WHERE status = 'active' ORDER BY department_name LIMIT 300` },
    { key: "employees", title: "Referensi pegawai", sql: `SELECT id,employee_number AS "employeeNumber",legal_name AS "legalName" FROM platform.company_employees WHERE employment_status = 'active' ORDER BY legal_name LIMIT 300` },
    { key: "budgets", title: "Anggaran internal", sql: `SELECT b.id,b.budget_code AS "budgetCode",d.department_name AS department,b.fiscal_year AS "fiscalYear",b.fiscal_period AS "fiscalPeriod",b.currency,b.allocated_amount AS "allocatedAmount",b.revised_amount AS "revisedAmount",b.status,b.approved_at AS "approvedAt" FROM platform.internal_budgets b LEFT JOIN platform.company_departments d ON d.id=b.department_id ORDER BY b.fiscal_year DESC,b.fiscal_period DESC LIMIT 100` },
    { key: "expenses", title: "Klaim biaya operasional", sql: `SELECT x.id,x.claim_number AS "claimNumber",e.employee_number AS "employeeNumber",e.legal_name AS employee,d.department_name AS department,x.expense_date AS "expenseDate",x.category,x.description,x.amount,x.currency,x.status,x.approved_at AS "approvedAt",x.paid_at AS "paidAt" FROM platform.internal_expense_claims x JOIN platform.company_employees e ON e.id=x.employee_id LEFT JOIN platform.company_departments d ON d.id=x.department_id ORDER BY x.expense_date DESC LIMIT 100` },
    { key: "assets", title: "Aset perusahaan", sql: `SELECT a.id,a.asset_code AS "assetCode",a.asset_name AS "assetName",a.category,a.serial_number AS "serialNumber",a.acquisition_date AS "acquisitionDate",a.acquisition_cost AS "acquisitionCost",a.status,d.department_name AS department,e.legal_name AS custodian FROM platform.company_assets a LEFT JOIN platform.company_departments d ON d.id=a.department_id LEFT JOIN platform.company_employees e ON e.id=a.custodian_employee_id ORDER BY a.created_at DESC LIMIT 100` },
    { key: "assetEvents", title: "Riwayat aset perusahaan", sql: `SELECT v.id,a.asset_code AS "assetCode",a.asset_name AS "assetName",v.event_type AS "eventType",v.event_summary AS "eventSummary",v.occurred_at AS "occurredAt",v.evidence_reference AS "evidenceReference" FROM platform.company_asset_events v JOIN platform.company_assets a ON a.id=v.asset_id ORDER BY v.occurred_at DESC LIMIT 100` },
  ],
  documents: [
    { key: "registry", title: "Register dokumen", sql: `SELECT id,document_number AS "documentNumber",document_type AS "documentType",title,description,classification,related_entity_type AS "relatedEntityType",related_entity_id AS "relatedEntityId",checksum_sha256 AS "checksumSha256",size_bytes AS "sizeBytes",retention_until AS "retentionUntil",status,created_at AS "createdAt" FROM platform.document_registry ORDER BY created_at DESC LIMIT 100` },
    { key: "versions", title: "Versi dokumen", sql: `SELECT v.id,d.document_number AS "documentNumber",d.title,v.version_number AS "versionNumber",v.checksum_sha256 AS "checksumSha256",v.size_bytes AS "sizeBytes",v.created_at AS "createdAt" FROM platform.document_versions v JOIN platform.document_registry d ON d.id=v.document_id ORDER BY v.created_at DESC LIMIT 100` },
    { key: "accessEvents", title: "Audit akses dokumen", sql: `SELECT e.id,d.document_number AS "documentNumber",d.title,e.actor_user_id AS "actorUserId",e.action,e.occurred_at AS "occurredAt",e.request_id AS "requestId" FROM platform.document_access_events e JOIN platform.document_registry d ON d.id=e.document_id ORDER BY e.occurred_at DESC LIMIT 100` },
  ]
};

function reply(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff", "referrer-policy": "no-referrer" });
  res.end(JSON.stringify(body));
}
function code(error: unknown): string { return typeof error === "object" && error !== null && "code" in error ? String((error as { code: unknown }).code) : ""; }


type WriteSpec = { table:string; fields:string[]; required:string[]; actor?:string; fixed?:Record<string,unknown> };
const writeSpecs:Record<string,Record<string,WriteSpec>> = {
 procurement:{
  vendors:{table:"vendors",fields:["vendor_code","legal_name","display_name","tax_id","email","phone","website","address","payment_terms_days","currency","notes"],required:["vendor_code","legal_name","display_name","address"],actor:"created_by",fixed:{status:"draft",risk_level:"unassessed"}},
  requisitions:{table:"purchase_requisitions",fields:["requisition_number","department","purpose","required_on","currency","estimated_total"],required:["requisition_number","purpose"],actor:"requested_by",fixed:{status:"draft"}},
  rfqs:{table:"request_for_quotations",fields:["rfq_number","requisition_id","title","instructions","currency","closes_at"],required:["rfq_number","requisition_id","title"],actor:"created_by",fixed:{status:"draft"}},
  purchaseOrders:{table:"purchase_orders",fields:["po_number","vendor_id","requisition_id","currency","expected_on"],required:["po_number","vendor_id"],actor:"created_by",fixed:{status:"draft"}}
 },
 inventory:{
  warehouses:{table:"warehouses",fields:["warehouse_code","warehouse_name","address","manager_user_id"],required:["warehouse_code","warehouse_name","address"],fixed:{status:"active"}},
  assets:{table:"fixed_assets",fields:["asset_code","asset_name","category","serial_number","acquisition_date","acquisition_cost","residual_value","useful_life_months","warehouse_id"],required:["asset_code","asset_name","category","acquisition_date","acquisition_cost","useful_life_months"],actor:"created_by",fixed:{status:"draft",depreciation_method:"straight_line"}},
  transfers:{table:"stock_transfers",fields:["transfer_number","source_warehouse_id","destination_warehouse_id"],required:["transfer_number","source_warehouse_id","destination_warehouse_id"],actor:"requested_by",fixed:{status:"draft"}}
 },
 hrd:{
  departments:{table:"company_departments",fields:["department_code","department_name","parent_department_id","manager_employee_id","cost_center"],required:["department_code","department_name"],fixed:{status:"active"}},
  employees:{table:"company_employees",fields:["employee_number","legal_name","preferred_name","work_email","work_phone","employment_type","hire_date"],required:["employee_number","legal_name","employment_type","hire_date"],actor:"created_by",fixed:{employment_status:"draft"}},
  leave:{table:"company_leave_requests",fields:["request_number","employee_id","leave_type","starts_on","ends_on","requested_days","reason"],required:["request_number","employee_id","leave_type","starts_on","ends_on","requested_days"],fixed:{status:"submitted"}},
  payrollPeriods:{table:"company_payroll_periods",fields:["period_code","starts_on","ends_on","payment_date"],required:["period_code","starts_on","ends_on"],fixed:{status:"draft"}}
 },
 internal:{
  budgets:{table:"internal_budgets",fields:["budget_code","department_id","fiscal_year","fiscal_period","currency","allocated_amount"],required:["budget_code","fiscal_year","fiscal_period","allocated_amount"],fixed:{status:"draft",revised_amount:0}},
  expenses:{table:"internal_expense_claims",fields:["claim_number","employee_id","department_id","expense_date","category","description","amount","currency","document_id"],required:["claim_number","employee_id","expense_date","category","description","amount"],fixed:{status:"draft"}}
 },
 documents:{registry:{table:"document_registry",fields:["document_number","document_type","title","description","classification","related_entity_type","related_entity_id","checksum_sha256","size_bytes","retention_until"],required:["document_number","document_type","title"],actor:"created_by",fixed:{status:"draft"}}},
 support:{
  cases:{table:"support_cases",fields:["case_number","customer_id","installation_id","subject","description","severity","assigned_to","sla_due_at"],required:["case_number","subject","description","severity"],fixed:{status:"open",source_channel:"manual"}},
  incidents:{table:"installation_incidents",fields:["incident_number","installation_id","support_case_id","severity","title","summary","root_cause","impact_summary","first_seen_at"],required:["incident_number","installation_id","severity","title","summary","first_seen_at"],fixed:{status:"detected"}}
 },
 fleet:{installations:{table:"installations",fields:["customer_id","installation_code","display_name","deployment_mode","environment","app_version","connector_version"],required:["customer_id","installation_code","display_name","deployment_mode"],fixed:{status:"pending_enrollment",telemetry_policy:{}}}},
 backup:{policies:{table:"backup_policies",fields:["installation_id","policy_name","backup_scope","frequency","retention_days","target_type","target_reference","offsite_copy_required","immutable_copy_required","recovery_point_objective_minutes","recovery_time_objective_minutes"],required:["installation_id","policy_name","backup_scope","frequency","retention_days","target_type","target_reference"],fixed:{encryption_required:true,checksum_required:true,is_enabled:false}}},
 warranty:{claims:{table:"warranty_claims",fields:["claim_number","warranty_id","customer_id","installation_id","support_case_id","incident_id","subject","fault_description","severity"],required:["claim_number","warranty_id","customer_id","installation_id","subject","fault_description","severity"],fixed:{status:"submitted"}}},
 agents:{remoteJobs:{table:"remote_jobs",fields:["installation_id","job_type","safety_class","idempotency_key","expires_at","request_payload"],required:["installation_id","job_type","safety_class","idempotency_key","expires_at"],actor:"requested_by",fixed:{status:"pending_approval",request_payload:{}}}}
};
async function createOperationalRecord(req:IncomingMessage,res:ServerResponse,pool:TenantDatabase,userId:string,domain:string,dataset:string):Promise<void>{
 const spec=writeSpecs[domain]?.[dataset]; if(!spec){reply(res,404,{error:"operational_form_not_found"});return;}
 const chunks:Buffer[]=[];let size=0;
 for await(const chunk of req){const part=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);size+=part.length;if(size>32768){reply(res,413,{error:"payload_too_large"});return;}chunks.push(part);}
 let raw:unknown;try{raw=JSON.parse(Buffer.concat(chunks).toString("utf8"));}catch{reply(res,400,{error:"invalid_json"});return;}
 const body=raw&&typeof raw==="object"&&!Array.isArray(raw)?raw as Record<string,unknown>:null;
 const values=body?.values&&typeof body.values==="object"&&!Array.isArray(body.values)?body.values as Record<string,unknown>:null;
 if(!values){reply(res,422,{error:"values_required"});return;}
 const unknown=Object.keys(values).filter(k=>!spec.fields.includes(k));
 if(unknown.length){reply(res,422,{error:"unknown_fields",fields:unknown});return;}
 const missing=spec.required.filter(k=>values[k]===undefined||values[k]===null||values[k]==="");
 if(missing.length){reply(res,422,{error:"required_fields_missing",fields:missing});return;}
 for(const [key,value] of Object.entries(values)){
  if(typeof value==="string"&&value.length>5000||typeof value==="number"&&!Number.isFinite(value)||typeof value==="object"&&value!==null&&(Array.isArray(value)||!["address","request_payload"].includes(key))||typeof value==="function"){reply(res,422,{error:"invalid_field_value"});return;}
 }
 if(domain==="agents"&&(![0,1,2,3].includes(Number(values.safety_class))||!["health_check","collect_redacted_diagnostics","restart_allowlisted_service","rebuild_cache","other"].includes(String(values.job_type)))){reply(res,422,{error:"unsafe_agent_job_request"});return;}
 const entries:Array<[string,unknown]>=Object.entries({...spec.fixed,...values});if(spec.actor)entries.push([spec.actor,userId]);
 const columns=entries.map(x=>x[0]);const params=entries.map(x=>x[1]);const placeholders=entries.map((_,i)=>"$"+(i+1));
 if(!pool.connect){reply(res,503,{error:"platform_transaction_unavailable"});return;}
 const client=await pool.connect() as Client;let active=false;
 try{
  await client.query("BEGIN");active=true;
  const admin=await client.query<{allowed:boolean}>("SELECT EXISTS(SELECT 1 FROM platform.super_admins WHERE user_id=$1::uuid AND status='active') AS allowed",[userId]);
  if(admin.rows[0]?.allowed!==true){await client.query("ROLLBACK");active=false;reply(res,403,{error:"platform_super_admin_required"});return;}
  await client.query("SELECT set_config('app.user_id',$1,true)",[userId]);await client.query("SET LOCAL ROLE pondok_platform_runtime");
  const inserted=await client.query<{id:string}>("INSERT INTO platform."+spec.table+" ("+columns.join(",")+") VALUES ("+placeholders.join(",")+") RETURNING id",params);
  const id=inserted.rows[0]?.id;if(!id)throw new Error("operational_insert_failed");
  await client.query("INSERT INTO platform.audit_events (actor_user_id,action,resource_type,resource_id,metadata) VALUES ($1::uuid,$2,$3,$4,$5::jsonb)",[userId,domain+"."+dataset+".created",spec.table,id,JSON.stringify({fieldNames:columns})]);
  await client.query("COMMIT");active=false;reply(res,201,{data:{id,domain,dataset,status:spec.fixed?.status??null}});
 }catch(error){
  if(active)await client.query("ROLLBACK").catch(()=>undefined);
  const ecode=typeof error==="object"&&error!==null&&"code" in error?String((error as {code:unknown}).code):"";
  if(ecode==="23505")reply(res,409,{error:"duplicate_record_code"});else if(ecode==="23503")reply(res,422,{error:"referenced_record_not_found"});else if(["23514","22P02","22007","22003"].includes(ecode))reply(res,422,{error:"field_constraint_violation"});else if(ecode==="42P01"||ecode==="3F000")reply(res,503,{error:"operational_schema_unavailable"});else reply(res,500,{error:"operational_record_create_failed"});
 }finally{client.release();}
}

export async function handlePlatformOperationsRequest(req: IncomingMessage, res: ServerResponse, pool: TenantDatabase, userId: string): Promise<boolean> {
  const path = new URL(req.url ?? "/", "http://localhost").pathname;
  const writeMatch = path.match(/^\/v1\/platform\/erp\/operations\/([a-z-]+)\/([A-Za-z]+)$/);
  if (writeMatch && req.method === "POST") { await createOperationalRecord(req, res, pool, userId, writeMatch[1]!, writeMatch[2]!); return true; }
  const match = path.match(/^\/v1\/platform\/erp\/operations\/([a-z-]+)$/);
  if (!match) return false;
  if (req.method !== "GET") { res.setHeader("allow", "GET"); reply(res, 405, { error: "method_not_allowed" }); return true; }
  const domain = match[1]!;
  const datasets = domains[domain];
  if (!datasets) { reply(res, 503, { error: "domain_schema_not_ready", domain }); return true; }
  if (!pool.connect) { reply(res, 503, { error: "platform_transaction_unavailable" }); return true; }
  const client = await pool.connect() as Client;
  let active = false;
  try {
    await client.query("BEGIN"); active = true;
    const auth = await client.query<{ allowed: boolean }>("SELECT EXISTS(SELECT 1 FROM platform.super_admins WHERE user_id=$1::uuid AND status='active') AS allowed", [userId]);
    if (auth.rows[0]?.allowed !== true) { await client.query("ROLLBACK"); active = false; reply(res, 403, { error: "platform_super_admin_required" }); return true; }
    await client.query("SELECT set_config('app.user_id',$1,true)", [userId]);
    await client.query("SET LOCAL ROLE pondok_platform_runtime");
    const result = [];
    for (const dataset of datasets) {
      const rows = await client.query(dataset.sql);
      result.push({ key: dataset.key, title: dataset.title, rows: rows.rows, returned: rows.rows.length });
    }
    await client.query("COMMIT"); active = false;
    reply(res, 200, { data: { domain, readOnly: false, writeEnabled: true, datasets: result, fetchedAt: new Date().toISOString() } });
  } catch (error) {
    if (active) await client.query("ROLLBACK").catch(() => undefined);
    reply(res, code(error) === "42P01" ? 503 : 500, { error: code(error) === "42P01" ? "domain_schema_not_deployed" : "platform_operations_read_failed", domain });
  } finally { client.release(); }
  return true;
}
