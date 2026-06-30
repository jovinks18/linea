CREATE TABLE agent_circuit_breakers (
  id BIGSERIAL PRIMARY KEY,
  breaker_key TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'global',
  status TEXT NOT NULL DEFAULT 'active' CHECK (
    status IN ('active', 'cleared')
  ),
  reason TEXT NOT NULL,
  triggered_by TEXT NOT NULL,
  triggered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cleared_by TEXT,
  cleared_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_agent_circuit_breakers_breaker_key
  ON agent_circuit_breakers(breaker_key);
CREATE INDEX idx_agent_circuit_breakers_status
  ON agent_circuit_breakers(status);
CREATE INDEX idx_agent_circuit_breakers_scope
  ON agent_circuit_breakers(scope);
CREATE INDEX idx_agent_circuit_breakers_triggered_at
  ON agent_circuit_breakers(triggered_at DESC);
