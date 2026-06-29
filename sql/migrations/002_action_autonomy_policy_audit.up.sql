CREATE TABLE action_autonomy_policy_audit (
  id BIGSERIAL PRIMARY KEY,
  action_type TEXT NOT NULL,
  segment TEXT,
  old_policy JSONB,
  new_policy JSONB NOT NULL,
  change_type TEXT NOT NULL CHECK (
    change_type IN ('created', 'updated', 'deleted', 'seeded')
  ),
  changed_by TEXT NOT NULL,
  change_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_action_autonomy_policy_audit_action_type
  ON action_autonomy_policy_audit(action_type);
CREATE INDEX idx_action_autonomy_policy_audit_segment
  ON action_autonomy_policy_audit(segment);
CREATE INDEX idx_action_autonomy_policy_audit_change_type
  ON action_autonomy_policy_audit(change_type);
CREATE INDEX idx_action_autonomy_policy_audit_created_at
  ON action_autonomy_policy_audit(created_at DESC);
