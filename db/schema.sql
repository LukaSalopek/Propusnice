CREATE TABLE IF NOT EXISTS passes (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name      TEXT NOT NULL,
  document  TEXT NOT NULL,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status    TEXT NOT NULL DEFAULT 'ACTIVE'
            CHECK (status IN ('ACTIVE', 'CANCELLED'))
);