import type { IncomingMessage, ServerResponse } from "node:http";
import type { TenantDatabase } from "./tenant-db.js";

type Client = { query<T = unknown>(sql: string, values?: unknown[]): Promise<{ rows: T[] }>; release(): void };
type Dataset = { key: string; title: string; sql: string };
const domains: Record<string, Dataset[]> = {
  support: [
    { key: "cases", title: "Tiket dukungan", sql: `SELECT s.id,s.case_number AS "caseNumber",c.display_name AS customer,s.subject,s.severity,s.status,s.source_channel AS "sourceChannel",s.sla_due_at AS "slaDueAt",s.created_at AS "createdAt",s.updated_at AS "updatedAt" FROM platform.support_cases s LEFT JOIN platform.customers c ON c.id=s.customer_id ORDER BY s.created_at DESC LIMIT 100` },
    { key: "incidents", title: "Insiden instalasi", sql: `SELECT i.id,i.incident_number AS "incidentNumber",f.display_name AS installation,i.title,i.severity,i.status,i.detected_at AS "detectedAt",i.resolved_at AS "resolvedAt",i.created_at AS "createdAt" FROM platform.installation_incidents i LEFT JOIN platform.installations f ON f.id=i.installation_id ORDER BY i.created_at DESC LIMIT 100` },
  ],
  fleet: [
    { key: "installations", title: "Instalasi klien", sql: `SELECT i.id,i.installation_code AS "installationCode",i.display_name AS "displayName",c.display_name AS customer,i.deployment_mode AS "deploymentMode",i.environment,i.status,i.app_version AS "appVersion",i.connector_version AS "connectorVersion",i.last_heartbeat_at AS "lastHeartbeatAt",i.last_verified_backup_at AS "lastVerifiedBackupAt" FROM platform.installations i JOIN platform.customers c ON c.id=i.customer_id ORDER BY i.updated_at DESC LIMIT 100` },
    { key: "health", title: "Pemeriksaan kesehatan", sql: `SELECT h.id,i.display_name AS installation,h.check_type AS "checkType",h.status,h.score,h.checked_at AS "checkedAt",h.duration_ms AS "durationMs" FROM platform.installation_health_checks h JOIN platform.installations i ON i.id=h.installation_id ORDER BY h.checked_at DESC LIMIT 100` },
    { key: "logs", title: "Log teredaksi", sql: `SELECT l.id,i.display_name AS installation,l.event_time AS "eventTime",l.source,l.severity,l.category,l.event_code AS "eventCode",l.message_redacted AS message,l.environment,l.app_version AS "appVersion" FROM platform.installation_log_events l JOIN platform.installations i ON i.id=l.installation_id ORDER BY l.event_time DESC LIMIT 100` },
  ],
  backup: [
    { key: "policies", title: "Kebijakan backup", sql: `SELECT p.id,i.display_name AS installation,p.policy_name AS "policyName",p.backup_scope AS "backupScope",p.frequency,p.retention_days AS "retentionDays",p.target_type AS "targetType",p.encryption_required AS "encryptionRequired",p.checksum_required AS "checksumRequired",p.offsite_copy_required AS "offsiteCopyRequired",p.immutable_copy_required AS "immutableCopyRequired",p.recovery_point_objective_minutes AS "rpoMinutes",p.recovery_time_objective_minutes AS "rtoMinutes",p.is_enabled AS "isEnabled",p.approved_at AS "approvedAt" FROM platform.backup_policies p LEFT JOIN platform.installations i ON i.id=p.installation_id ORDER BY p.created_at DESC LIMIT 100` },
    { key: "runs", title: "Riwayat backup & restore test", sql: `SELECT b.id,i.display_name AS installation,b.trigger_type AS "triggerType",b.status,b.started_at AS "startedAt",b.finished_at AS "finishedAt",b.encrypted,b.checksum_algorithm AS "checksumAlgorithm",b.verification_status AS "verificationStatus",b.restore_tested_at AS "restoreTestedAt",b.restore_test_status AS "restoreTestStatus",b.size_bytes AS "sizeBytes",b.failure_code AS "failureCode",b.failure_summary_redacted AS "failureSummary" FROM platform.backup_runs b LEFT JOIN platform.installations i ON i.id=b.installation_id ORDER BY b.created_at DESC LIMIT 100` },
  ],
  warranty: [
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
    { key: "runs", title: "Riwayat eksekusi agent", sql: `SELECT id,agent_key AS "agentKey",trigger_type AS "triggerType",status,installation_id AS "installationId",summary,estimated_cost AS "estimatedCost",started_at AS "startedAt",finished_at AS "finishedAt",created_at AS "createdAt" FROM platform.agent_runs ORDER BY created_at DESC LIMIT 100` },
    { key: "findings", title: "Temuan keamanan", sql: `SELECT f.id,i.display_name AS installation,f.severity,f.category,f.title,f.status,f.detected_at AS "detectedAt",f.acknowledged_at AS "acknowledgedAt",f.resolved_at AS "resolvedAt" FROM platform.security_findings f LEFT JOIN platform.installations i ON i.id=f.installation_id ORDER BY f.detected_at DESC LIMIT 100` },
    { key: "remoteJobs", title: "Tugas jarak jauh terstruktur", sql: `SELECT id,installation_id AS "installationId",job_type AS "jobType",safety_class AS "safetyClass",status,result_summary AS "resultSummary",expires_at AS "expiresAt",approved_at AS "approvedAt",dispatched_at AS "dispatchedAt",completed_at AS "completedAt",created_at AS "createdAt" FROM platform.remote_jobs ORDER BY created_at DESC LIMIT 100` },
    { key: "approvals", title: "Permintaan persetujuan", sql: `SELECT id,request_type AS "requestType",resource_type AS "resourceType",resource_id AS "resourceId",status,decision_note AS "decisionNote",expires_at AS "expiresAt",decided_at AS "decidedAt",created_at AS "createdAt" FROM platform.approval_requests ORDER BY created_at DESC LIMIT 100` },
  ],
};

function reply(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff", "referrer-policy": "no-referrer" });
  res.end(JSON.stringify(body));
}
function code(error: unknown): string { return typeof error === "object" && error !== null && "code" in error ? String((error as { code: unknown }).code) : ""; }

export async function handlePlatformOperationsRequest(req: IncomingMessage, res: ServerResponse, pool: TenantDatabase, userId: string): Promise<boolean> {
  const match = new URL(req.url ?? "/", "http://localhost").pathname.match(/^\/v1\/platform\/erp\/operations\/([a-z-]+)$/);
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
    reply(res, 200, { data: { domain, readOnly: true, datasets: result, fetchedAt: new Date().toISOString() } });
  } catch (error) {
    if (active) await client.query("ROLLBACK").catch(() => undefined);
    reply(res, code(error) === "42P01" ? 503 : 500, { error: code(error) === "42P01" ? "domain_schema_not_deployed" : "platform_operations_read_failed", domain });
  } finally { client.release(); }
  return true;
}
