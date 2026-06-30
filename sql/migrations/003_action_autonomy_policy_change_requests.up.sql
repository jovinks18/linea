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
      'rejected'
    )
  );

CREATE TABLE action_autonomy_policy_change_requests (
  id BIGSERIAL PRIMARY KEY,
  action_type TEXT NOT NULL,
  segment TEXT,
  old_policy JSONB NOT NULL,
  proposed_policy JSONB NOT NULL,
  patch JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'approved', 'rejected', 'cancelled')
  ),
  requested_by TEXT NOT NULL,
  request_reason TEXT NOT NULL,
  reviewed_by TEXT,
  review_reason TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_action_autonomy_policy_change_requests_status
  ON action_autonomy_policy_change_requests(status);
CREATE INDEX idx_action_autonomy_policy_change_requests_action_type
  ON action_autonomy_policy_change_requests(action_type);
CREATE INDEX idx_action_autonomy_policy_change_requests_segment
  ON action_autonomy_policy_change_requests(segment);
CREATE INDEX idx_action_autonomy_policy_change_requests_created_at
  ON action_autonomy_policy_change_requests(created_at DESC);
