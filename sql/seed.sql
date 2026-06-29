INSERT INTO accounts
(name, industry, plan, stage, health_status, owner_name, go_live_date)
VALUES
('Acme Clinics', 'Healthcare', 'Growth', 'implementation', 'at_risk', 'Jordan Lee', '2026-07-03'),
('Northstar Apartments', 'Property Management', 'Pro', 'onboarding', 'healthy', 'Priya Shah', '2026-07-10'),
('Bluebird Coworking', 'Coworking', 'Starter', 'live', 'watch', 'Mateo Rivera', '2026-06-12'),
('Summit School District', 'Education', 'Enterprise', 'discovery', 'unknown', 'Avery Kim', NULL)
ON CONFLICT (name) DO UPDATE SET
  industry = EXCLUDED.industry,
  plan = EXCLUDED.plan,
  stage = EXCLUDED.stage,
  health_status = EXCLUDED.health_status,
  owner_name = EXCLUDED.owner_name,
  go_live_date = EXCLUDED.go_live_date,
  updated_at = NOW();

INSERT INTO account_contacts
(account_id, customer_id, contact_role, is_primary)
SELECT accounts.id, customers.id, 'Operations Lead', TRUE
FROM accounts
JOIN customers ON customers.email = 'maya.chen@example.com'
WHERE accounts.name = 'Acme Clinics'
ON CONFLICT (account_id, customer_id) DO UPDATE SET
  contact_role = EXCLUDED.contact_role,
  is_primary = EXCLUDED.is_primary,
  updated_at = NOW();

INSERT INTO account_contacts
(account_id, customer_id, contact_role, is_primary)
SELECT accounts.id, customers.id, 'Facilities Manager', TRUE
FROM accounts
JOIN customers ON customers.email = 'arjun.mehta@example.com'
WHERE accounts.name = 'Northstar Apartments'
ON CONFLICT (account_id, customer_id) DO UPDATE SET
  contact_role = EXCLUDED.contact_role,
  is_primary = EXCLUDED.is_primary,
  updated_at = NOW();

INSERT INTO account_contacts
(account_id, customer_id, contact_role, is_primary)
SELECT accounts.id, customers.id, 'Community Manager', TRUE
FROM accounts
JOIN customers ON customers.email = 'sofia.garcia@example.com'
WHERE accounts.name = 'Bluebird Coworking'
ON CONFLICT (account_id, customer_id) DO UPDATE SET
  contact_role = EXCLUDED.contact_role,
  is_primary = EXCLUDED.is_primary,
  updated_at = NOW();

INSERT INTO implementation_steps
(account_id, step_name, status, owner_role, due_date, metadata)
SELECT id, 'Connect API', 'blocked', 'Implementation Manager', '2026-07-01',
  '{"blocker": "Customer API credentials are not validating"}'::jsonb
FROM accounts
WHERE name = 'Acme Clinics'
ON CONFLICT (account_id, step_name) DO UPDATE SET
  status = EXCLUDED.status,
  owner_role = EXCLUDED.owner_role,
  due_date = EXCLUDED.due_date,
  metadata = EXCLUDED.metadata,
  updated_at = NOW();

INSERT INTO implementation_steps
(account_id, step_name, status, owner_role, due_date, metadata)
SELECT id, 'Configure smart lock gateway', 'in_progress', 'Solutions Engineer', '2026-07-02',
  '{"site": "Primary clinic entrance"}'::jsonb
FROM accounts
WHERE name = 'Acme Clinics'
ON CONFLICT (account_id, step_name) DO UPDATE SET
  status = EXCLUDED.status,
  owner_role = EXCLUDED.owner_role,
  due_date = EXCLUDED.due_date,
  metadata = EXCLUDED.metadata,
  updated_at = NOW();

INSERT INTO implementation_steps
(account_id, step_name, status, owner_role, due_date, metadata)
SELECT id, 'Train site admin', 'not_started', 'Customer Success Manager', '2026-07-03',
  '{"audience": "Clinic site administrators"}'::jsonb
FROM accounts
WHERE name = 'Acme Clinics'
ON CONFLICT (account_id, step_name) DO UPDATE SET
  status = EXCLUDED.status,
  owner_role = EXCLUDED.owner_role,
  due_date = EXCLUDED.due_date,
  metadata = EXCLUDED.metadata,
  updated_at = NOW();

INSERT INTO tasks
(account_id, title, description, status, priority, owner_role, due_date)
SELECT id, 'Follow up on blocked API setup',
  'CSM should coordinate with Acme Clinics before the planned go-live date.',
  'open', 'P1', 'Customer Success Manager', '2026-06-29'
FROM accounts
WHERE name = 'Acme Clinics'
ON CONFLICT (account_id, title) DO UPDATE SET
  description = EXCLUDED.description,
  status = EXCLUDED.status,
  priority = EXCLUDED.priority,
  owner_role = EXCLUDED.owner_role,
  due_date = EXCLUDED.due_date,
  updated_at = NOW();

INSERT INTO product_signals
(account_id, signal_type, title, description, severity, status)
SELECT id, 'integration_gap', 'API setup is blocking go-live',
  'Synthetic demo signal: API setup friction is delaying implementation.',
  'high', 'new'
FROM accounts
WHERE name = 'Acme Clinics'
ON CONFLICT (account_id, signal_type, title) DO UPDATE SET
  description = EXCLUDED.description,
  severity = EXCLUDED.severity,
  status = EXCLUDED.status,
  updated_at = NOW();

INSERT INTO account_health_events
(account_id, health_status, event_type, event_description, metadata)
SELECT id, 'at_risk', 'onboarding_blocker',
  'API setup blocker threatens planned go-live.',
  '{"reason": "blocked_implementation_step", "source": "synthetic_seed"}'::jsonb
FROM accounts
WHERE name = 'Acme Clinics'
ON CONFLICT (account_id, event_type, event_description) DO UPDATE SET
  health_status = EXCLUDED.health_status,
  metadata = EXCLUDED.metadata;

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
  ('require_human_review', NULL, 'bounded', 0.90, 1, TRUE, 'seed'),
  ('create_support_case', NULL, 'bounded', 0.90, 1, TRUE, 'seed'),
  ('create_csm_task', NULL, 'bounded', 0.90, 1, TRUE, 'seed'),
  ('log_product_signal', NULL, 'bounded', 0.90, 1, TRUE, 'seed'),
  -- Default health policies stay review-gated; linked-account overrides below
  -- preserve the current deterministic blocker workflow.
  ('create_account_health_event', NULL, 'supervised', 0.90, 1, TRUE, 'seed'),
  ('update_account_health', NULL, 'supervised', 0.90, 1, TRUE, 'seed'),
  -- Support cases already exist before directive planning, so the segment
  -- policy permits the existing deterministic support confidence.
  ('create_support_case', 'linked_account', 'bounded', 0.70, 1, TRUE, 'seed'),
  ('detect_onboarding_blocker', 'linked_account', 'bounded', 0.80, 1, TRUE, 'seed'),
  ('create_csm_task', 'linked_account', 'bounded', 0.80, 1, TRUE, 'seed'),
  ('log_product_signal', 'linked_account', 'bounded', 0.80, 1, TRUE, 'seed'),
  ('create_account_health_event', 'linked_account', 'bounded', 0.80, 1, TRUE, 'seed'),
  ('update_account_health', 'linked_account', 'bounded', 0.80, 1, FALSE, 'seed'),
  ('require_human_review', 'linked_account', 'bounded', 0.80, 1, TRUE, 'seed'),
  ('create_support_case', 'unknown_account', 'bounded', 0.80, 1, TRUE, 'seed'),
  ('detect_onboarding_blocker', 'unknown_account', 'supervised', 0.90, 1, TRUE, 'seed'),
  ('create_csm_task', 'unknown_account', 'supervised', 0.90, 1, TRUE, 'seed'),
  ('log_product_signal', 'unknown_account', 'supervised', 0.90, 1, TRUE, 'seed'),
  ('create_account_health_event', 'unknown_account', 'supervised', 0.90, 1, TRUE, 'seed'),
  ('update_account_health', 'unknown_account', 'supervised', 0.90, 1, TRUE, 'seed'),
  -- Keep unknown-account review as a suggestion at current confidence 0.85.
  ('require_human_review', 'unknown_account', 'bounded', 0.90, 1, TRUE, 'seed')
ON CONFLICT (action_type, segment) DO UPDATE SET
  tier = EXCLUDED.tier,
  confidence_floor = EXCLUDED.confidence_floor,
  max_blast_radius = EXCLUDED.max_blast_radius,
  requires_reversible = EXCLUDED.requires_reversible,
  updated_by = EXCLUDED.updated_by,
  updated_at = NOW();

-- Policy audit rows are intentionally not seeded. Seed provenance remains
-- visible through action_autonomy_policy.updated_by = 'seed' without creating
-- duplicate audit history when this idempotent seed file is run repeatedly.
