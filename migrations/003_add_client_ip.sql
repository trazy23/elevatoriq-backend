-- 003: Track client IP on cases for free-tier abuse prevention
ALTER TABLE cases ADD COLUMN IF NOT EXISTS client_ip TEXT;

CREATE INDEX IF NOT EXISTS cases_client_ip_idx ON cases(client_ip)
  WHERE client_ip IS NOT NULL;
