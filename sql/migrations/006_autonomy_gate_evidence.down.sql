DROP INDEX IF EXISTS idx_action_autonomy_policy_change_requests_gate_run_id;
DROP INDEX IF EXISTS idx_action_autonomy_policy_change_requests_eval_run_id;
DROP INDEX IF EXISTS idx_action_autonomy_policy_audit_gate_run_id;
DROP INDEX IF EXISTS idx_action_autonomy_policy_audit_eval_run_id;

ALTER TABLE action_autonomy_policy_change_requests
  DROP COLUMN IF EXISTS gate_run_id,
  DROP COLUMN IF EXISTS sample_size,
  DROP COLUMN IF EXISTS unsafe_gate_rate,
  DROP COLUMN IF EXISTS f1,
  DROP COLUMN IF EXISTS eval_run_id;

ALTER TABLE action_autonomy_policy_audit
  DROP COLUMN IF EXISTS gate_run_id,
  DROP COLUMN IF EXISTS sample_size,
  DROP COLUMN IF EXISTS unsafe_gate_rate,
  DROP COLUMN IF EXISTS f1,
  DROP COLUMN IF EXISTS eval_run_id;

ALTER TABLE action_autonomy_policy_audit
  DROP CONSTRAINT action_autonomy_policy_audit_change_type_check;

UPDATE action_autonomy_policy_audit
SET change_type = 'updated'
WHERE change_type = 'auto_demoted';

ALTER TABLE action_autonomy_policy_audit
  ADD CONSTRAINT action_autonomy_policy_audit_change_type_check CHECK (
    change_type IN (
      'created',
      'updated',
      'deleted',
      'seeded',
      'requested',
      'approved',
      'rejected'
    )
  );
