-- Global system roles and least-privilege permission maps.
-- Organization owners are assigned explicitly by the one-time bootstrap workflow.
BEGIN;
INSERT INTO core.permissions (permission_key, description) VALUES
 ('core.organization.manage','Manage institution profile and tenant configuration'),
 ('core.campus.manage','Manage campuses and campus settings'),
 ('core.members.manage','Invite, suspend and manage institution memberships'),
 ('audit.events.read','View institution audit events'),
 ('reports.read','View operational reports'),
 ('reports.export','Export authorized operational reports'),
 ('settings.manage','Manage institution configuration')
ON CONFLICT (permission_key) DO UPDATE SET description = EXCLUDED.description;

INSERT INTO core.roles (organization_id, role_key, role_name, is_system) VALUES
 (NULL,'institution_owner','Pemilik Institusi',true),
 (NULL,'institution_admin','Administrator Institusi',true),
 (NULL,'academic_admin','Administrator Akademik',true),
 (NULL,'teacher','Pengajar / Musyrif',true),
 (NULL,'finance_admin','Administrator Keuangan',true),
 (NULL,'hr_admin','Administrator SDM',true),
 (NULL,'librarian','Pustakawan',true),
 (NULL,'admission_officer','Petugas PPDB',true),
 (NULL,'boarding_supervisor','Pengasuh Asrama',true),
 (NULL,'inventory_manager','Pengelola Inventaris',true),
 (NULL,'read_only_auditor','Auditor Baca-Saja',true)
ON CONFLICT (organization_id, role_key) DO UPDATE
SET role_name = EXCLUDED.role_name, is_system = true;

INSERT INTO core.role_permissions (role_id, permission_key)
SELECT r.id, p.permission_key
FROM core.roles r
CROSS JOIN core.permissions p
WHERE r.organization_id IS NULL
  AND CASE r.role_key
    WHEN 'institution_owner' THEN true
    WHEN 'institution_admin' THEN true
    WHEN 'academic_admin' THEN
      p.permission_key LIKE 'academic.%' OR p.permission_key LIKE 'admissions.%'
      OR p.permission_key LIKE 'boarding.%' OR p.permission_key LIKE 'library.%'
      OR p.permission_key LIKE 'cms.%' OR p.permission_key LIKE 'reports.%'
    WHEN 'teacher' THEN p.permission_key IN (
      'academic.students.read','academic.attendance.read','academic.attendance.write',
      'academic.classes.read','academic.enrollments.read','boarding.leave.read'
    )
    WHEN 'finance_admin' THEN p.permission_key LIKE 'finance.%'
      OR p.permission_key LIKE 'reports.%'
    WHEN 'hr_admin' THEN p.permission_key LIKE 'hr.%'
    WHEN 'librarian' THEN p.permission_key LIKE 'library.%'
    WHEN 'admission_officer' THEN p.permission_key LIKE 'admissions.%'
    WHEN 'boarding_supervisor' THEN p.permission_key LIKE 'boarding.%'
    WHEN 'inventory_manager' THEN p.permission_key LIKE 'inventory.%'
      OR p.permission_key LIKE 'procurement.%' OR p.permission_key LIKE 'assets.%'
    WHEN 'read_only_auditor' THEN p.permission_key LIKE '%.read'
      OR p.permission_key IN ('audit.events.read','reports.export')
    ELSE false
  END
ON CONFLICT (role_id, permission_key) DO NOTHING;
COMMIT;
