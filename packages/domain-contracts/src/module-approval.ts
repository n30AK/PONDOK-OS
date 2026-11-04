export type ModuleRequestStatus =
  | "draft" | "submitted" | "approved" | "rejected"
  | "installing" | "installed" | "failed" | "rollback_pending" | "rolled_back";

export type ModuleRequestAction =
  | "submit" | "approve" | "reject" | "begin_install"
  | "mark_installed" | "mark_failed" | "request_rollback" | "complete_rollback";

export interface ModuleRequestActor {
  id: string;
  roles: ReadonlySet<"module_author" | "super_admin" | "module_installer" | "system">;
}

export interface ModuleRequestRecord {
  id: string;
  organizationId: string;
  moduleId: string;
  manifestDigest: string;
  submittedBy: string;
  status: ModuleRequestStatus;
  createdAt: string;
  updatedAt: string;
  approvedBy?: string;
  rejectionReason?: string;
  failureReason?: string;
  audit: ReadonlyArray<{
    action: ModuleRequestAction;
    actorId: string;
    from: ModuleRequestStatus;
    to: ModuleRequestStatus;
    occurredAt: string;
    note?: string;
  }>;
}

export interface ModuleRequestTransition {
  action: ModuleRequestAction;
  actor: ModuleRequestActor;
  occurredAt: string;
  note?: string;
}

function deny(code: string): never {
  throw new Error(`MODULE_REQUEST_TRANSITION_DENIED:${code}`);
}

/**
 * Pure state transition policy. Persistence, cryptographic digest verification,
 * signatures, and installation execution belong to trusted server services.
 */
export function transitionModuleRequest(
  current: ModuleRequestRecord,
  input: ModuleRequestTransition,
): ModuleRequestRecord {
  const { action, actor, occurredAt, note } = input;
  if (!actor.id || !occurredAt || Number.isNaN(Date.parse(occurredAt))) deny("invalid_actor_or_timestamp");
  if (!current.id || !current.organizationId || !current.moduleId || !/^[a-f0-9]{64}$/i.test(current.manifestDigest)) deny("invalid_request_record");
  if (occurredAt < current.updatedAt) deny("timestamp_regression");

  let next: ModuleRequestStatus;
  switch (action) {
    case "submit":
      if (current.status !== "draft") deny("submit_requires_draft");
      if (actor.id !== current.submittedBy && !actor.roles.has("module_author")) deny("submit_requires_author");
      next = "submitted";
      break;
    case "approve":
    case "reject":
      if (current.status !== "submitted") deny("review_requires_submitted");
      if (!actor.roles.has("super_admin")) deny("review_requires_super_admin");
      if (actor.id === current.submittedBy) deny("self_approval_forbidden");
      if (action === "reject" && !note?.trim()) deny("rejection_reason_required");
      next = action === "approve" ? "approved" : "rejected";
      break;
    case "begin_install":
      if (current.status !== "approved") deny("install_requires_approval");
      if (!actor.roles.has("module_installer") && !actor.roles.has("system")) deny("install_requires_trusted_installer");
      next = "installing";
      break;
    case "mark_installed":
      if (current.status !== "installing") deny("completion_requires_installing");
      if (!actor.roles.has("module_installer") && !actor.roles.has("system")) deny("completion_requires_trusted_installer");
      next = "installed";
      break;
    case "mark_failed":
      if (current.status !== "installing") deny("failure_requires_installing");
      if (!actor.roles.has("module_installer") && !actor.roles.has("system")) deny("failure_requires_trusted_installer");
      if (!note?.trim()) deny("failure_reason_required");
      next = "failed";
      break;
    case "request_rollback":
      if (current.status !== "installed" && current.status !== "failed") deny("rollback_requires_installed_or_failed");
      if (!actor.roles.has("super_admin")) deny("rollback_requires_super_admin");
      if (!note?.trim()) deny("rollback_reason_required");
      next = "rollback_pending";
      break;
    case "complete_rollback":
      if (current.status !== "rollback_pending") deny("rollback_not_approved");
      if (!actor.roles.has("module_installer") && !actor.roles.has("system")) deny("rollback_requires_trusted_installer");
      next = "rolled_back";
      break;
    default: {
      const exhaustive: never = action;
      return exhaustive;
    }
  }

  return {
    ...current,
    status: next,
    updatedAt: occurredAt,
    ...(action === "approve" ? { approvedBy: actor.id } : {}),
    ...(action === "reject" ? { rejectionReason: note!.trim() } : {}),
    ...(action === "mark_failed" ? { failureReason: note!.trim() } : {}),
    audit: [...current.audit, { action, actorId: actor.id, from: current.status, to: next, occurredAt, ...(note ? { note } : {}) }],
  };
}
