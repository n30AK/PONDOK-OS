export type OrganizationStatus = "active" | "suspended" | "archived";
export type MembershipStatus = "invited" | "active" | "suspended" | "revoked";

export interface OrganizationRef {
  id: string;
  slug: string;
  name: string;
  status: OrganizationStatus;
}

export interface CampusRef {
  id: string;
  organizationId: string;
  code: string;
  name: string;
}

export interface TenantContext {
  organizationId: string;
  userId: string;
  campusId?: string;
  permissions: ReadonlySet<string>;
}

export function assertTenantAccess(
  context: TenantContext,
  resourceOrganizationId: string,
): void {
  if (!context.organizationId || context.organizationId !== resourceOrganizationId) {
    throw new Error("TENANT_ACCESS_DENIED");
  }
}

export function hasPermission(
  context: TenantContext,
  permission: string,
): boolean {
  return context.permissions.has(permission);
}
