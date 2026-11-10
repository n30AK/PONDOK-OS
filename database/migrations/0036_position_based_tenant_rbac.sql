-- Position-based tenant RBAC profiles. Additive; preserve existing roles and assignments.
-- Apply only to Neon Development first.
BEGIN;

INSERT INTO core.roles (organization_id, role_key, role_name, is_system) VALUES
(NULL,'foundation_chair','Ketua Yayasan',true),
(NULL,'foundation_secretary','Sekretaris Yayasan',true),
(NULL,'foundation_treasurer','Bendahara Yayasan',true),
(NULL,'pondok_leader','Pimpinan / Pengasuh Pondok',true),
(NULL,'pondok_deputy','Wakil Pimpinan Pondok',true),
(NULL,'pondok_secretary','Sekretaris Pondok',true),
(NULL,'pondok_treasurer','Bendahara Pondok',true),
(NULL,'academic_coordinator','Koordinator Pendidikan',true),
(NULL,'student_affairs_coordinator','Koordinator Kesantrian',true),
(NULL,'school_principal','Kepala Satuan Pendidikan',true),
(NULL,'homeroom_teacher','Wali Kelas / Wali Halaqah',true),
(NULL,'musyrif','Musyrif / Pengasuh Asrama',true),
(NULL,'finance_cashier','Kasir / Petugas Keuangan',true),
(NULL,'finance_verifier','Verifikator Keuangan',true),
(NULL,'procurement_officer','Petugas Pengadaan',true),
(NULL,'warehouse_staff','Petugas Gudang',true),
(NULL,'hr_officer','Staf Kepegawaian',true),
(NULL,'safeguarding_officer','Petugas Perlindungan Santri',true),
(NULL,'cms_editor','Editor Website & Publikasi',true)
ON CONFLICT (organization_id, role_key) DO UPDATE
SET role_name=EXCLUDED.role_name,is_system=true;

-- Governance: read and monitor, but no unrestricted tenant administration or payment execution.
INSERT INTO core.role_permissions (role_id,permission_key)
SELECT r.id,p.permission_key FROM core.roles r CROSS JOIN core.permissions p
WHERE r.organization_id IS NULL AND r.role_key='foundation_chair'
AND (p.permission_key IN ('core.organization.manage','audit.events.read','reports.read','reports.export')
 OR p.permission_key LIKE '%.read')
ON CONFLICT DO NOTHING;

-- Foundation secretary: institutional administration, correspondence, CMS, and reporting.
INSERT INTO core.role_permissions (role_id,permission_key)
SELECT r.id,p.permission_key FROM core.roles r CROSS JOIN core.permissions p
WHERE r.organization_id IS NULL AND r.role_key='foundation_secretary'
AND (p.permission_key IN ('core.organization.manage','core.campus.manage','core.members.manage','audit.events.read','reports.read','reports.export')
 OR p.permission_key LIKE 'cms.%' OR p.permission_key LIKE 'crm.contacts.%')
ON CONFLICT DO NOTHING;

-- Foundation treasurer: financial oversight and read-only cross-unit reporting.
INSERT INTO core.role_permissions (role_id,permission_key)
SELECT r.id,p.permission_key FROM core.roles r CROSS JOIN core.permissions p
WHERE r.organization_id IS NULL AND r.role_key='foundation_treasurer'
AND (p.permission_key LIKE 'finance.%.read' OR p.permission_key IN ('reports.read','reports.export','audit.events.read')
 OR p.permission_key LIKE 'finance.reports.%')
ON CONFLICT DO NOTHING;

-- Pondok leadership: broad operational oversight; no access to restricted identity/health by default.
INSERT INTO core.role_permissions (role_id,permission_key)
SELECT r.id,p.permission_key FROM core.roles r CROSS JOIN core.permissions p
WHERE r.organization_id IS NULL AND r.role_key IN ('pondok_leader','pondok_deputy')
AND (p.permission_key LIKE 'academic.%' OR p.permission_key LIKE 'admissions.%'
 OR p.permission_key LIKE 'boarding.%' OR p.permission_key LIKE 'library.%'
 OR p.permission_key LIKE 'hr.organization.%' OR p.permission_key LIKE 'hr.educators.%'
 OR p.permission_key LIKE 'finance.%.read' OR p.permission_key LIKE 'inventory.%.read'
 OR p.permission_key LIKE 'procurement.%.read' OR p.permission_key LIKE 'assets.%.read'
 OR p.permission_key LIKE 'cms.%' OR p.permission_key LIKE 'reports.%'
 OR p.permission_key IN ('audit.events.read'))
ON CONFLICT DO NOTHING;

-- Pondok secretary: coordination and reporting, limited writes in CMS and academic administration.
INSERT INTO core.role_permissions (role_id,permission_key)
SELECT r.id,p.permission_key FROM core.roles r CROSS JOIN core.permissions p
WHERE r.organization_id IS NULL AND r.role_key='pondok_secretary'
AND (p.permission_key LIKE 'academic.%' OR p.permission_key LIKE 'admissions.%'
 OR p.permission_key LIKE 'cms.%' OR p.permission_key LIKE 'reports.%'
 OR p.permission_key IN ('audit.events.read'))
ON CONFLICT DO NOTHING;

-- Pondok treasurer and finance cashier: operational finance; verifier is separate for segregation of duties.
INSERT INTO core.role_permissions (role_id,permission_key)
SELECT r.id,p.permission_key FROM core.roles r CROSS JOIN core.permissions p
WHERE r.organization_id IS NULL AND r.role_key='pondok_treasurer'
AND (p.permission_key LIKE 'finance.%' OR p.permission_key LIKE 'reports.%' OR p.permission_key='audit.events.read')
ON CONFLICT DO NOTHING;

INSERT INTO core.role_permissions (role_id,permission_key)
SELECT r.id,p.permission_key FROM core.roles r CROSS JOIN core.permissions p
WHERE r.organization_id IS NULL AND r.role_key='finance_cashier'
AND (p.permission_key IN ('finance.transactions.read','finance.transactions.write','finance.payments.read','finance.receipts.read')
 OR p.permission_key LIKE 'finance.cash.%')
ON CONFLICT DO NOTHING;

INSERT INTO core.role_permissions (role_id,permission_key)
SELECT r.id,p.permission_key FROM core.roles r CROSS JOIN core.permissions p
WHERE r.organization_id IS NULL AND r.role_key='finance_verifier'
AND (p.permission_key LIKE 'finance.%.read' OR p.permission_key LIKE 'finance.approvals.%'
 OR p.permission_key IN ('reports.read','audit.events.read'))
ON CONFLICT DO NOTHING;

-- Education and student affairs are separated by their operational responsibilities.
INSERT INTO core.role_permissions (role_id,permission_key)
SELECT r.id,p.permission_key FROM core.roles r CROSS JOIN core.permissions p
WHERE r.organization_id IS NULL AND r.role_key IN ('academic_coordinator','school_principal')
AND (p.permission_key LIKE 'academic.%' OR p.permission_key LIKE 'admissions.%'
 OR p.permission_key LIKE 'hr.educators.%' OR p.permission_key LIKE 'reports.%')
ON CONFLICT DO NOTHING;

INSERT INTO core.role_permissions (role_id,permission_key)
SELECT r.id,p.permission_key FROM core.roles r CROSS JOIN core.permissions p
WHERE r.organization_id IS NULL AND r.role_key='homeroom_teacher'
AND p.permission_key IN ('academic.students.read','academic.enrollments.read',
'academic.attendance.read','academic.attendance.write','academic.classes.read')
ON CONFLICT DO NOTHING;

INSERT INTO core.role_permissions (role_id,permission_key)
SELECT r.id,p.permission_key FROM core.roles r CROSS JOIN core.permissions p
WHERE r.organization_id IS NULL AND r.role_key IN ('student_affairs_coordinator','musyrif')
AND (p.permission_key LIKE 'boarding.%' OR p.permission_key IN
('academic.students.read','academic.enrollments.read','reports.read'))
ON CONFLICT DO NOTHING;

-- Restricted safeguarding role can read/write incident workflows only; never broad health/identity access.
INSERT INTO core.role_permissions (role_id,permission_key)
SELECT r.id,p.permission_key FROM core.roles r CROSS JOIN core.permissions p
WHERE r.organization_id IS NULL AND r.role_key='safeguarding_officer'
AND p.permission_key IN ('boarding.incidents.read','boarding.incidents.write','boarding.leave.read','reports.read')
ON CONFLICT DO NOTHING;

-- Library, procurement, warehouse, HR and CMS have focused profiles.
INSERT INTO core.role_permissions (role_id,permission_key)
SELECT r.id,p.permission_key FROM core.roles r CROSS JOIN core.permissions p
WHERE r.organization_id IS NULL AND r.role_key='librarian'
AND p.permission_key LIKE 'library.%'
ON CONFLICT DO NOTHING;

INSERT INTO core.role_permissions (role_id,permission_key)
SELECT r.id,p.permission_key FROM core.roles r CROSS JOIN core.permissions p
WHERE r.organization_id IS NULL AND r.role_key='procurement_officer'
AND (p.permission_key LIKE 'procurement.%' OR p.permission_key LIKE 'inventory.purchase.%'
 OR p.permission_key IN ('reports.read'))
ON CONFLICT DO NOTHING;

INSERT INTO core.role_permissions (role_id,permission_key)
SELECT r.id,p.permission_key FROM core.roles r CROSS JOIN core.permissions p
WHERE r.organization_id IS NULL AND r.role_key='warehouse_staff'
AND (p.permission_key LIKE 'inventory.%' OR p.permission_key LIKE 'assets.register.read')
ON CONFLICT DO NOTHING;

INSERT INTO core.role_permissions (role_id,permission_key)
SELECT r.id,p.permission_key FROM core.roles r CROSS JOIN core.permissions p
WHERE r.organization_id IS NULL AND r.role_key='hr_officer'
AND (p.permission_key LIKE 'hr.%' OR p.permission_key IN ('reports.read'))
ON CONFLICT DO NOTHING;

INSERT INTO core.role_permissions (role_id,permission_key)
SELECT r.id,p.permission_key FROM core.roles r CROSS JOIN core.permissions p
WHERE r.organization_id IS NULL AND r.role_key='cms_editor'
AND p.permission_key IN ('cms.pages.manage','cms.announcements.manage')
ON CONFLICT DO NOTHING;

COMMIT;
