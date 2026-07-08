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

CREATE INDEX idx_model_scorecard_eval_run_id
  ON model_scorecard(eval_run_id);
CREATE INDEX idx_model_scorecard_action_type
  ON model_scorecard(action_type);
CREATE INDEX idx_model_scorecard_computed_at
  ON model_scorecard(computed_at DESC);
