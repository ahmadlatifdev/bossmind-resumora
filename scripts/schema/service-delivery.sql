-- Service delivery + refunds schema (Neon / Postgres optional)
-- Firestore collections ServiceEvents / Plans / Refunds are primary for Resumora.

CREATE TABLE IF NOT EXISTS "Plans" (
  plan_id TEXT PRIMARY KEY,
  total_milestones INTEGER NOT NULL DEFAULT 2
);

INSERT INTO "Plans" (plan_id, total_milestones) VALUES
  ('basic', 2),
  ('balanced', 3),
  ('professional', 5),
  ('advanced', 5)
ON CONFLICT (plan_id) DO UPDATE SET total_milestones = EXCLUDED.total_milestones;

CREATE TABLE IF NOT EXISTS "ServiceEvents" (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  subscription_id TEXT,
  user_id TEXT,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'resume_uploaded',
    'consultation_completed',
    'final_resume_delivered',
    'video_generated',
    'onboarding_completed'
  )),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_service_events_customer
  ON "ServiceEvents" (customer_id, subscription_id);

CREATE TABLE IF NOT EXISTS "Refunds" (
  id TEXT PRIMARY KEY,
  refund_id TEXT,
  customer_id TEXT NOT NULL,
  subscription_id TEXT,
  user_id TEXT,
  amount INTEGER NOT NULL,
  currency TEXT DEFAULT 'usd',
  status TEXT NOT NULL CHECK (status IN ('pending', 'completed', 'failed')),
  reason TEXT,
  charge_id TEXT,
  stripe_refund_id TEXT,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_refunds_customer ON "Refunds" (customer_id);
