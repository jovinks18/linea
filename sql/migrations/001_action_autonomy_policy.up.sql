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
