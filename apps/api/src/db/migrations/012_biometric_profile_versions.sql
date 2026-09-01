CREATE TABLE IF NOT EXISTS proctoring_biometric_profile_versions (
  id CHAR(36) PRIMARY KEY,
  profile_id CHAR(36) NOT NULL,
  version INT NOT NULL,
  algorithm VARCHAR(64) NOT NULL,
  descriptor_ciphertext BLOB NOT NULL,
  descriptor_length SMALLINT UNSIGNED NOT NULL,
  encryption_iv VARBINARY(16) NOT NULL,
  encryption_tag VARBINARY(32) NOT NULL,
  consent_version VARCHAR(64) NOT NULL,
  consented_at DATETIME(3) NOT NULL,
  enrolled_at DATETIME(3) NOT NULL,
  revoked_at DATETIME(3) NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY proctoring_biometric_profile_version_unique (profile_id, version),
  INDEX proctoring_biometric_profile_versions_status_idx (profile_id, status),
  CONSTRAINT proctoring_biometric_profile_versions_profile_fk
    FOREIGN KEY (profile_id) REFERENCES proctoring_biometric_profiles(id) ON DELETE CASCADE,
  CONSTRAINT proctoring_biometric_profile_versions_status_check
    CHECK (status IN ('active', 'revoked'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE proctoring_biometric_profiles
  ADD COLUMN IF NOT EXISTS active_version_id CHAR(36) NULL;

INSERT INTO proctoring_biometric_profile_versions (
  id, profile_id, version, algorithm, descriptor_ciphertext, descriptor_length,
  encryption_iv, encryption_tag, consent_version, consented_at, enrolled_at,
  revoked_at, status
)
SELECT UUID(), profiles.id, profiles.enrollment_version, profiles.algorithm,
  profiles.descriptor_ciphertext, profiles.descriptor_length, profiles.encryption_iv,
  profiles.encryption_tag, profiles.consent_version, profiles.consented_at,
  profiles.enrolled_at, profiles.revoked_at, IF(profiles.status = 'active', 'active', 'revoked')
FROM proctoring_biometric_profiles profiles
WHERE NOT EXISTS (
  SELECT 1 FROM proctoring_biometric_profile_versions versions
  WHERE versions.profile_id = profiles.id AND versions.version = profiles.enrollment_version
);

UPDATE proctoring_biometric_profiles profiles
JOIN proctoring_biometric_profile_versions versions
  ON versions.profile_id = profiles.id
  AND versions.version = profiles.enrollment_version
  AND versions.status = 'active'
SET profiles.active_version_id = versions.id;

ALTER TABLE proctoring_biometric_profiles
  ADD CONSTRAINT proctoring_biometric_profiles_active_version_fk
  FOREIGN KEY (active_version_id) REFERENCES proctoring_biometric_profile_versions(id);

ALTER TABLE proctoring_biometric_checks
  ADD COLUMN IF NOT EXISTS profile_version_id CHAR(36) NULL;
