CREATE TABLE customers (
  id SERIAL PRIMARY KEY,
  name TEXT,
  email TEXT UNIQUE,
  phone TEXT,
  telegram_id TEXT,
  preferred_channel TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE cases (
  id SERIAL PRIMARY KEY,
  case_number TEXT UNIQUE NOT NULL,
  customer_id INTEGER REFERENCES customers(id),
  subject TEXT,
  status TEXT DEFAULT 'open',
  intent TEXT,
  sentiment TEXT,
  priority TEXT DEFAULT 'P2',
  channel_origin TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  requires_human_review BOOLEAN NOT NULL DEFAULT FALSE,
  review_status TEXT NOT NULL DEFAULT 'none' CHECK (
    review_status IN ('none', 'flagged', 'resolved')
  ),
  last_activity_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  closed_at TIMESTAMP
);

CREATE TABLE messages (
  id SERIAL PRIMARY KEY,
  case_id INTEGER REFERENCES cases(id),
  customer_id INTEGER REFERENCES customers(id),
  channel TEXT,
  sender_type TEXT,
  message_text TEXT,
  internal_only BOOLEAN DEFAULT FALSE,
  ai_generated BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE case_events (
  id SERIAL PRIMARY KEY,
  case_id INTEGER REFERENCES cases(id),
  event_type TEXT,
  event_description TEXT,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE accounts (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  industry TEXT,
  plan TEXT,
  stage TEXT DEFAULT 'onboarding',
  health_status TEXT DEFAULT 'unknown',
  owner_name TEXT,
  go_live_date DATE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE account_contacts (
  id SERIAL PRIMARY KEY,
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  contact_role TEXT,
  is_primary BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(account_id, customer_id)
);

CREATE TABLE implementation_steps (
  id SERIAL PRIMARY KEY,
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  related_case_id INTEGER REFERENCES cases(id),
  step_name TEXT NOT NULL,
  status TEXT DEFAULT 'not_started',
  owner_role TEXT,
  due_date DATE,
  completed_at TIMESTAMP,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(account_id, step_name)
);

CREATE TABLE tasks (
  id SERIAL PRIMARY KEY,
  account_id INTEGER REFERENCES accounts(id),
  case_id INTEGER REFERENCES cases(id),
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'open',
  priority TEXT DEFAULT 'P2',
  owner_role TEXT,
  due_date DATE,
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(account_id, title)
);

CREATE TABLE product_signals (
  id SERIAL PRIMARY KEY,
  account_id INTEGER REFERENCES accounts(id),
  case_id INTEGER REFERENCES cases(id),
  source_message_id INTEGER REFERENCES messages(id),
  signal_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  severity TEXT DEFAULT 'medium',
  status TEXT DEFAULT 'new',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(account_id, signal_type, title)
);

CREATE TABLE account_health_events (
  id SERIAL PRIMARY KEY,
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  case_id INTEGER REFERENCES cases(id),
  health_status TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_description TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(account_id, event_type, event_description)
);

CREATE TABLE agent_actions (
  id BIGSERIAL PRIMARY KEY,
  case_id BIGINT REFERENCES cases(id) ON DELETE SET NULL,
  account_id BIGINT REFERENCES accounts(id) ON DELETE SET NULL,
  action_type TEXT NOT NULL,
  status TEXT NOT NULL CHECK (
    status IN ('executed', 'suggested', 'skipped', 'failed')
  ),
  source TEXT NOT NULL DEFAULT 'deterministic',
  confidence NUMERIC,
  reasoning_summary TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  executed_at TIMESTAMPTZ
);

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

CREATE TABLE action_autonomy_policy_audit (
  id BIGSERIAL PRIMARY KEY,
  action_type TEXT NOT NULL,
  segment TEXT,
  old_policy JSONB,
  new_policy JSONB NOT NULL,
  change_type TEXT NOT NULL CHECK (
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
  ),
  changed_by TEXT NOT NULL,
  change_reason TEXT,
  eval_run_id TEXT,
  f1 NUMERIC,
  unsafe_gate_rate NUMERIC,
  sample_size INTEGER,
  gate_run_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
  eval_run_id TEXT,
  f1 NUMERIC,
  unsafe_gate_rate NUMERIC,
  sample_size INTEGER,
  gate_run_id TEXT,
  reviewed_by TEXT,
  review_reason TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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

CREATE TABLE model_scorecard (
  id BIGSERIAL PRIMARY KEY,
  action_type TEXT NOT NULL,
  eval_run_id TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (
    mode IN ('offline')
  ),
  f1 NUMERIC NOT NULL,
  precision NUMERIC NOT NULL,
  recall NUMERIC NOT NULL,
  priority_exact NUMERIC NOT NULL,
  unsafe_gate_rate NUMERIC NOT NULL,
  sample_size INTEGER NOT NULL,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_accounts_health_status ON accounts(health_status);
CREATE INDEX idx_accounts_stage ON accounts(stage);
CREATE INDEX idx_account_contacts_customer_id ON account_contacts(customer_id);
CREATE INDEX idx_implementation_steps_account_id ON implementation_steps(account_id);
CREATE INDEX idx_tasks_account_id ON tasks(account_id);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_product_signals_account_id ON product_signals(account_id);
CREATE INDEX idx_product_signals_signal_type ON product_signals(signal_type);
CREATE INDEX idx_account_health_events_account_id ON account_health_events(account_id);
CREATE INDEX idx_agent_actions_case_id ON agent_actions(case_id);
CREATE INDEX idx_agent_actions_account_id ON agent_actions(account_id);
CREATE INDEX idx_agent_actions_action_type ON agent_actions(action_type);
CREATE INDEX idx_agent_actions_status ON agent_actions(status);
CREATE INDEX idx_agent_actions_source ON agent_actions(source);
CREATE INDEX idx_agent_actions_created_at ON agent_actions(created_at);
CREATE INDEX idx_action_autonomy_policy_audit_action_type
  ON action_autonomy_policy_audit(action_type);
CREATE INDEX idx_action_autonomy_policy_audit_segment
  ON action_autonomy_policy_audit(segment);
CREATE INDEX idx_action_autonomy_policy_audit_change_type
  ON action_autonomy_policy_audit(change_type);
CREATE INDEX idx_action_autonomy_policy_audit_created_at
  ON action_autonomy_policy_audit(created_at DESC);
CREATE INDEX idx_action_autonomy_policy_audit_eval_run_id
  ON action_autonomy_policy_audit(eval_run_id);
CREATE INDEX idx_action_autonomy_policy_audit_gate_run_id
  ON action_autonomy_policy_audit(gate_run_id);
CREATE INDEX idx_action_autonomy_policy_change_requests_status
  ON action_autonomy_policy_change_requests(status);
CREATE INDEX idx_action_autonomy_policy_change_requests_action_type
  ON action_autonomy_policy_change_requests(action_type);
CREATE INDEX idx_action_autonomy_policy_change_requests_segment
  ON action_autonomy_policy_change_requests(segment);
CREATE INDEX idx_action_autonomy_policy_change_requests_created_at
  ON action_autonomy_policy_change_requests(created_at DESC);
CREATE INDEX idx_action_autonomy_policy_change_requests_eval_run_id
  ON action_autonomy_policy_change_requests(eval_run_id);
CREATE INDEX idx_action_autonomy_policy_change_requests_gate_run_id
  ON action_autonomy_policy_change_requests(gate_run_id);
CREATE INDEX idx_agent_circuit_breakers_breaker_key
  ON agent_circuit_breakers(breaker_key);
CREATE INDEX idx_agent_circuit_breakers_status
  ON agent_circuit_breakers(status);
CREATE INDEX idx_agent_circuit_breakers_scope
  ON agent_circuit_breakers(scope);
CREATE INDEX idx_agent_circuit_breakers_triggered_at
  ON agent_circuit_breakers(triggered_at DESC);
CREATE INDEX idx_model_scorecard_eval_run_id
  ON model_scorecard(eval_run_id);
CREATE INDEX idx_model_scorecard_action_type
  ON model_scorecard(action_type);
CREATE INDEX idx_model_scorecard_computed_at
  ON model_scorecard(computed_at DESC);
CREATE INDEX idx_cases_human_review ON cases(last_activity_at DESC)
  WHERE requires_human_review = TRUE;

INSERT INTO customers 
(name, email, phone, telegram_id, preferred_channel)
VALUES
('Maya Chen', 'maya.chen@example.com', '+14155550101', 'tg_maya_chen', 'web_chat'),
('Arjun Mehta', 'arjun.mehta@example.com', '+14155550102', 'tg_arjun_mehta', 'telegram'),
('Sofia Garcia', 'sofia.garcia@example.com', '+14155550103', 'tg_sofia_garcia', 'email');
