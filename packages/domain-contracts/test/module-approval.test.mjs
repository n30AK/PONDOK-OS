import test from "node:test";
import assert from "node:assert/strict";
import { transitionModuleRequest } from "../dist/index.js";

const digest = "a".repeat(64);
const initial = () => ({
  id: "req-1", organizationId: "org-1", moduleId: "id.pondokos.cooperative",
  manifestDigest: digest, submittedBy: "author-1", status: "draft",
  createdAt: "2026-11-04T10:00:00.000Z", updatedAt: "2026-11-04T10:00:00.000Z", audit: [],
});
const actor = (id, ...roles) => ({ id, roles: new Set(roles) });
const at = (minute) => `2026-11-04T10:${String(minute).padStart(2,"0")}:00.000Z`;

test("requires submit, independent Super Admin approval, then trusted installation", () => {
  const submitted = transitionModuleRequest(initial(), { action:"submit", actor:actor("author-1","module_author"), occurredAt:at(1) });
  assert.equal(submitted.status, "submitted");
  assert.throws(() => transitionModuleRequest(submitted, { action:"approve", actor:actor("author-1","super_admin"), occurredAt:at(2) }), /self_approval_forbidden/);
  assert.throws(() => transitionModuleRequest(submitted, { action:"approve", actor:actor("reviewer","module_author"), occurredAt:at(2) }), /review_requires_super_admin/);
  const approved = transitionModuleRequest(submitted, { action:"approve", actor:actor("sa-1","super_admin"), occurredAt:at(2) });
  assert.equal(approved.approvedBy, "sa-1");
  assert.throws(() => transitionModuleRequest(approved, { action:"begin_install", actor:actor("sa-1","super_admin"), occurredAt:at(3) }), /install_requires_trusted_installer/);
  const installing = transitionModuleRequest(approved, { action:"begin_install", actor:actor("system","system"), occurredAt:at(3) });
  const installed = transitionModuleRequest(installing, { action:"mark_installed", actor:actor("system","system"), occurredAt:at(4) });
  assert.equal(installed.status, "installed");
  assert.equal(installed.audit.length, 4);
});

test("rejection and rollback require explicit reasons and Super Admin authority", () => {
  const submitted = transitionModuleRequest(initial(), { action:"submit", actor:actor("author-1","module_author"), occurredAt:at(1) });
  assert.throws(() => transitionModuleRequest(submitted, { action:"reject", actor:actor("sa-1","super_admin"), occurredAt:at(2) }), /rejection_reason_required/);
  const rejected = transitionModuleRequest(submitted, { action:"reject", actor:actor("sa-1","super_admin"), occurredAt:at(2), note:"Dokumen belum lengkap" });
  assert.equal(rejected.rejectionReason, "Dokumen belum lengkap");
});

test("failed installation needs reason and rollback approval before execution", () => {
  const submitted = transitionModuleRequest(initial(), { action:"submit", actor:actor("author-1","module_author"), occurredAt:at(1) });
  const approved = transitionModuleRequest(submitted, { action:"approve", actor:actor("sa-1","super_admin"), occurredAt:at(2) });
  const installing = transitionModuleRequest(approved, { action:"begin_install", actor:actor("system","system"), occurredAt:at(3) });
  assert.throws(() => transitionModuleRequest(installing, { action:"mark_failed", actor:actor("system","system"), occurredAt:at(4) }), /failure_reason_required/);
  const failed = transitionModuleRequest(installing, { action:"mark_failed", actor:actor("system","system"), occurredAt:at(4), note:"Migration dry-run failed" });
  assert.throws(() => transitionModuleRequest(failed, { action:"complete_rollback", actor:actor("system","system"), occurredAt:at(5) }), /rollback_not_approved/);
  const pending = transitionModuleRequest(failed, { action:"request_rollback", actor:actor("sa-1","super_admin"), occurredAt:at(5), note:"Restore previous release" });
  const rolled = transitionModuleRequest(pending, { action:"complete_rollback", actor:actor("system","system"), occurredAt:at(6) });
  assert.equal(rolled.status, "rolled_back");
});

test("rejects timestamp regression and invalid manifest digest", () => {
  const row = initial();
  assert.throws(() => transitionModuleRequest(row, { action:"submit", actor:actor("author-1","module_author"), occurredAt:"2026-11-04T09:59:00Z" }), /timestamp_regression/);
  row.manifestDigest = "not-a-digest";
  assert.throws(() => transitionModuleRequest(row, { action:"submit", actor:actor("author-1","module_author"), occurredAt:at(1) }), /invalid_request_record/);
});
