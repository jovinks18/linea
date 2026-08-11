# Architecture

Linea is a supervised agent runtime for post-sales operations. Its central
invariant is:

```text
model proposes -> policy decides -> executor acts -> agent_actions audit -> human supervises
```

The model never writes to PostgreSQL, calls repositories, or bypasses policy.
Every database mutation is performed by deterministic server code after policy
and directive checks, and every proposed, executed, skipped, or failed action is
recorded in `agent_actions`.

## Runtime Map

```text
customer message
  -> lib/intake orchestration
  -> lib/triage deterministic triage + optional model classifier
  -> lib/agent policy decision
  -> lib/agent action directives + autonomy policy
  -> executor + repository writes
  -> agent_actions audit
  -> operator review and override
```

`lib/intake` owns request orchestration: customer/account lookup, case creation
or restore, triage, optional model calls, directive planning, execution, audit,
and response assembly.

`lib/triage` owns classification inputs. The deterministic classifier is the
default and fallback. The optional model classifier may propose `intent`,
`sentiment`, `priority`, and `classification`, but it still enters the same
policy and audit envelope.

`lib/agent` owns the governance layer: decision shaping, autonomy policy,
directives, blast radius, circuit breakers, execution result shaping, audit
records, scorecard readers, and autonomy gates.

`lib/*/repository.ts` files are the database boundary. They contain parameterized
PostgreSQL reads and writes for their domain. Models do not import or call them.

`lib/eval` owns the offline harness and golden set. It runs the real triage,
decision, directive, and `decide()` paths against hand-labeled cases, checks
unsafe gates, and writes `model_scorecard` evidence for the deterministic gate.

## Autonomy

Autonomy is granted per `action_type` and segment, not to the agent as a whole.
Segments include linked accounts, unknown accounts, and default policy rows.

The ladder is:

- `shadow`: never executes; records the counterfactual suggestion.
- `supervised`: proposes only; a human must approve.
- `bounded`: may execute automatically when every guard passes.
- `autonomous`: represented in the schema and decision code, but not reached by
  automatic promotion.

Execution is deny-by-default. Missing policy falls back to a restrictive
supervised decision. Bounded execution still has to pass confidence, blast
radius, reversibility, and circuit-breaker checks.

Automatic promotion is deliberately capped at `bounded`. The `unknown_account`
segment has an additional ceiling: it never climbs into auto-execution because
unverified accounts must hold for human review.

Gates move tiers only from `model_scorecard` evidence. Promotion creates a
human-reviewed policy change request. Demotion is automatic and immediate when
evidence falls below the floor or unsafe gates appear. Tier changes include
structured evidence such as `eval_run_id`, `f1`, `unsafe_gate_rate`,
`sample_size`, and `gate_run_id`.

## Model Boundary

Models are optional. The default runtime is deterministic and requires no model
server or API key.

When configured, an LLM sits in a proposer role. It may propose classification
or planning data, but policy decides what is allowed, directives apply autonomy
guards, the executor performs permitted writes, and audit records the facts.
Unknown-account and high-stakes review rules still apply regardless of model
output.

The Groq classifier experiment tested whether a frontier LLM should replace
deterministic triage. It did not: the LLM was less accurate on the honest golden
set and showed non-deterministic unsafe-gate behavior. Deterministic triage
therefore remains the default and safety-critical gate. See
[GROQ-EXPERIMENT.md](GROQ-EXPERIMENT.md).

## Data Boundaries

Core business tables include `customers`, `accounts`, `account_contacts`,
`cases`, `messages`, `case_events`, `implementation_steps`, `tasks`,
`product_signals`, and `account_health_events`.

Governance and audit tables include `agent_actions`, `action_autonomy_policy`,
`action_autonomy_policy_audit`,
`action_autonomy_policy_change_requests`, `agent_circuit_breakers`, and
`model_scorecard`.

CSV and connector ingestion normalize external-looking data into Linea's
canonical schema before any agent behavior runs. Source-specific fields stay in
metadata, and imports remain deterministic and auditable.

## Where To Read Next

- [DECISION-SPEC.md](DECISION-SPEC.md): the labeling and review rules.
- [case-lifecycle.html](case-lifecycle.html): the case flowchart.
- [GROQ-EXPERIMENT.md](GROQ-EXPERIMENT.md): the LLM classifier experiment.
- [CONNECTORS.md](CONNECTORS.md): connector boundaries and ingestion phases.
