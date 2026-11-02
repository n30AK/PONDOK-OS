-- Academic API permissions and operational lookup indexes.
-- Additive and repeatable; apply only through the migration runner on development first.
BEGIN;
INSERT INTO core.permissions (permission_key, description) VALUES
  ('academic.students.read', 'View student records within the active organization'),
  ('academic.students.create', 'Create student records within the active organization'),
  ('academic.students.update', 'Update student records within the active organization'),
  ('academic.students.archive', 'Change student lifecycle status within the active organization'),
  ('academic.attendance.read', 'View attendance records within the active organization'),
  ('academic.attendance.write', 'Record attendance within the active organization'),
  ('academic.classes.read', 'View class groups within the active organization'),
  ('academic.classes.write', 'Manage class groups within the active organization'),
  ('academic.enrollments.read', 'View student enrollments within the active organization'),
  ('academic.enrollments.write', 'Manage student enrollments within the active organization')
ON CONFLICT (permission_key) DO UPDATE SET description = EXCLUDED.description;
CREATE INDEX IF NOT EXISTS idx_academic_students_org_created ON academic.student_profiles (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_academic_students_org_name ON academic.student_profiles (organization_id, legal_name);
COMMIT;
