ALTER TABLE proctoring_monitoring_observations
  ADD COLUMN IF NOT EXISTS job_id CHAR(36) NULL;

CREATE UNIQUE INDEX IF NOT EXISTS proctoring_monitoring_observations_job_unique
  ON proctoring_monitoring_observations (job_id);
