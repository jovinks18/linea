ALTER TABLE action_autonomy_policy_audit
  DROP CONSTRAINT action_autonomy_policy_audit_change_type_check;

ALTER TABLE action_autonomy_policy_audit
  ADD CONSTRAINT action_autonomy_policy_audit_change_type_check CHECK (
    change_type IN (
      'created',
      'updated',
      'deleted',
      'seeded',
      'requested',
      'approved',
      'rejected',
      'auto_demoted'
    )
  );

ALTER TABLE action_autonomy_policy_audit
  ADD COLUMN eval_run_id TEXT,
  ADD COLUMN f1 NUMERIC,
  ADD COLUMN unsafe_gate_rate NUMERIC,
  ADD COLUMN sample_size INTEGER,
  ADD COLUMN gate_run_id TEXT;

ALTER TABLE action_autonomy_policy_change_requests
  ADD COLUMN eval_run_id TEXT,
  ADD COLUMN f1 NUMERIC,
  ADD COLUMN unsafe_gate_rate NUMERIC,
  ADD COLUMN sample_size INTEGER,
  ADD COLUMN gate_run_id TEXT;

CREATE INDEX idx_action_autonomy_policy_audit_eval_run_id
  ON action_autonomy_policy_audit(eval_run_id);
CREATE INDEX idx_action_autonomy_policy_audit_gate_run_id
  ON action_autonomy_policy_audit(gate_run_id);
CREATE INDEX idx_action_autonomy_policy_change_requests_eval_run_id
  ON action_autonomy_policy_change_requests(eval_run_id);
CREATE INDEX idx_action_autonomy_policy_change_requests_gate_run_id
  ON action_autonomy_policy_change_requests(gate_run_id);
