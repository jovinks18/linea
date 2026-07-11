CREATE TABLE action_autonomy_policy (
  action_type TEXT NOT NULL,
  segment TEXT,
  tier TEXT NOT NULL DEFAULT 'shadow' CHECK (
    tier IN ('shadow', 'supervised', 'bounded', 'autonomous')
  ),
  confidence_floor NUMERIC NOT NULL DEFAULT 0.90,
  max_blast_radius INT NOT NULL DEFAULT 1,
  requires_reversible BOOLEAN NOT NULL DEFAULT TRUE,
  updated_by TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE NULLS NOT DISTINCT (action_type, segment)
);

INSERT INTO action_autonomy_policy
(
  action_type,
  segment,
  tier,
  confidence_floor,
  max_blast_radius,
  requires_reversible,
  updated_by
)
VALUES
  ('create_support_case', NULL, 'bounded', 0.90, 1, TRUE, 'seed'),
  ('create_csm_task', NULL, 'bounded', 0.90, 1, TRUE, 'seed'),
  ('log_product_signal', NULL, 'bounded', 0.90, 1, TRUE, 'seed'),
  ('create_account_health_event', NULL, 'supervised', 0.90, 1, TRUE, 'seed'),
  ('update_account_health', NULL, 'supervised', 0.90, 1, TRUE, 'seed'),
  ('create_support_case', 'linked_account', 'bounded', 0.70, 1, TRUE, 'seed'),
  ('detect_onboarding_blocker', 'linked_account', 'bounded', 0.80, 1, TRUE, 'seed'),
  ('create_csm_task', 'linked_account', 'bounded', 0.80, 1, TRUE, 'seed'),
  ('log_product_signal', 'linked_account', 'bounded', 0.80, 1, TRUE, 'seed'),
  ('create_account_health_event', 'linked_account', 'bounded', 0.80, 1, TRUE, 'seed'),
  ('update_account_health', 'linked_account', 'bounded', 0.80, 1, FALSE, 'seed'),
  ('create_support_case', 'unknown_account', 'bounded', 0.80, 1, TRUE, 'seed'),
  ('detect_onboarding_blocker', 'unknown_account', 'supervised', 0.90, 1, TRUE, 'seed'),
  ('create_csm_task', 'unknown_account', 'supervised', 0.90, 1, TRUE, 'seed'),
  ('log_product_signal', 'unknown_account', 'supervised', 0.90, 1, TRUE, 'seed'),
  ('create_account_health_event', 'unknown_account', 'supervised', 0.90, 1, TRUE, 'seed'),
  ('update_account_health', 'unknown_account', 'supervised', 0.90, 1, TRUE, 'seed');
