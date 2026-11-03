BEGIN;

-- Structured operational details for the student master form.
-- Keep this as an allow-listed JSON object; do not put NIK, health records,
-- biometric data, or other restricted data in this field.
ALTER TABLE academic.student_profiles
  ADD COLUMN IF NOT EXISTS profile_data jsonb NOT NULL DEFAULT '{}'::jsonb;

DO $validation$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'academic.student_profiles'::regclass
      AND conname = 'student_profiles_profile_data_object'
  ) THEN
    ALTER TABLE academic.student_profiles
      ADD CONSTRAINT student_profiles_profile_data_object
      CHECK (jsonb_typeof(profile_data) = 'object');
  END IF;
END
$validation$;

COMMIT;
