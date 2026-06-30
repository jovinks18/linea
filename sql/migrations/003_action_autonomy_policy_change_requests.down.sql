DROP TABLE IF EXISTS action_autonomy_policy_change_requests;

ALTER TABLE action_autonomy_policy_audit
  DROP CONSTRAINT action_autonomy_policy_audit_change_type_check;

UPDATE action_autonomy_policy_audit
SET change_type = 'updated'
WHERE change_type IN ('requested', 'approved', 'rejected');

ALTER TABLE action_autonomy_policy_audit
  ADD CONSTRAINT action_autonomy_policy_audit_change_type_check CHECK (
    change_type IN ('created', 'updated', 'deleted', 'seeded')
  );
