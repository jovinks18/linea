# Linea

A supervised agent runtime for post-sales operations.

Linea is built around a narrow contract: the model proposes, policy decides, the executor acts, audit records facts, and a human supervises. Autonomy is earned per action type and account segment, not granted to "the agent" as a whole.

The project is local-first and synthetic-data-only today. It demonstrates how support intake, post-sales automation, evaluation, and autonomy governance can share one auditable runtime instead of living as separate demos.

## How It Works

The clearest path through Linea is the known-account versus unknown-account flow:

```text
maya.chen@example.com
Our API setup is still blocked and we are supposed to go live Friday.
```

Maya is linked to the seeded Acme Clinics account. Linea creates the support case, detects the onboarding blocker, runs the proposed account actions through policy, executes the actions that are allowed, and records the outcome in `agent_actions`.

Send the same message from any unrecognized email and the behavior changes. Linea still creates the support case, but account-scoped actions hold for human review because there is no verified linked account. The operator-facing rule is: actions auto-execute only for verified linked accounts; unknown accounts hold for human review.

## Quickstart

Requirements: Node.js, npm, Docker, and Docker Compose.

```bash
git clone https://github.com/jovinks18/linea
cd linea
npm ci
cp .env.example .env.local
docker compose up -d postgres
npm run dev
```

Open [http://localhost:3000/chat](http://localhost:3000/chat) and run the two messages above side by side. The known account executes permitted post-sales actions; the unknown account creates the case and queues review.

Policy Admin also requires local operator credentials in `.env.local`:

```dotenv
LINEA_ADMIN_USERNAME=your-local-operator-name
LINEA_ADMIN_PASSWORD=use-a-long-local-password
LINEA_SESSION_SECRET=generate-a-random-secret-of-at-least-32-characters
```

`DATABASE_URL` is optional. Without it, the app and importer use the local Docker PostgreSQL defaults from `docker-compose.yml`. Fresh Docker initialization loads `sql/schema.sql` and `sql/seed.sql`.

Useful local surfaces:

| Surface | URL |
| --- | --- |
| Chat intake | [http://localhost:3000/chat](http://localhost:3000/chat) |
| Dashboard | [http://localhost:3000/dashboard](http://localhost:3000/dashboard) |
| Policy Admin | [http://localhost:3000/admin/policies](http://localhost:3000/admin/policies) |
| Data onboarding | [http://localhost:3000/data](http://localhost:3000/data) |

## What Linea Does

Linea currently provides:

- Deterministic support intake with case creation, case restore, message history, triage, and account lookup.
- Post-sales automation for linked-account onboarding blockers: CSM tasks, product signals, account health events, and account health updates.
- Agent action directives that apply autonomy policy before any governed action executes.
- Durable audit rows for executed, suggested, skipped, and failed actions.
- Policy administration with signed local operator sessions and human-reviewed change requests.
- Offline golden-set evaluation that writes scorecard evidence for autonomy gates.
- CSV profiling, mapping recommendation, validation, dry runs, and idempotent imports into the canonical schema.
- A connector contract and synthetic HubSpot-style fixture importer, without live SaaS credentials or writeback.

## How Linea Decides

Linea acts on its own when the case is confident and low-risk, hands off to a human when the case is uncertain or high-stakes, and records every decision so an operator can audit or override it.

The decision model asks four questions:

- Is this a current blocker, or only blocker-like vocabulary?
- How urgent is the impact right now?
- Does uncertainty or stakes require human review?
- Does this create or change account-health state?

The full rules live in [docs/DECISION-SPEC.md](docs/DECISION-SPEC.md), which is a living document with an amendment log. The requested case lifecycle flowchart path, `docs/case-lifecycle.html`, is not present in this checkout yet.

## Autonomy Ladder

Autonomy policy is keyed by `action_type` and segment: `linked_account`, `unknown_account`, or a default row. The tiers are:

| Tier | Behavior |
| --- | --- |
| `shadow` | Never executes; records a counterfactual suggestion. |
| `supervised` | Proposes only; a human must approve. |
| `bounded` | Executes automatically only when every guard passes. |
| `autonomous` | Represented in the schema and decision code, but not reached by automatic promotion. |

Execution is deny-by-default. If a governed action has no matching segment or default policy, Linea falls back to a restrictive supervised policy. Bounded execution still has to pass the configured confidence floor, blast-radius limit, reversibility requirement, and circuit-breaker check.

Automatic promotion is capped at `bounded` by design. Nothing in this system promotes itself to fully autonomous. The `unknown_account` segment has an additional ceiling: it never climbs into auto-execution regardless of score, because unverified accounts should not receive account-level mutations.

Two actions are policy-exempt:

- `create_support_case` always runs because the case is the intake container the audit trail lives in.
- `require_human_review` is the safe fallback. Guarding it would let the system fail to ask for help.

## Offline Eval

The offline harness lives in `lib/eval` and runs through `scripts/eval.mjs`.

It loads the bundled hand-labeled golden set in `lib/eval/golden`, currently 26 synthetic cases with deliberate near-misses. The labels are derived from the decision spec and kept hand-authored because unknown labels cannot benchmark correctness, and model-generated labels would only measure model-vs-model agreement.

The harness runs the real runtime path: `runBasicTriage`, `buildPolicyDecision`, `buildActionDirectives`, and the same `decide()` logic used by action directives. It aborts unless `MODEL_PROVIDER=deterministic`.

Eval runs are read-only except for `model_scorecard`. The runner fingerprints guarded business tables before and after evaluation and fails if the eval mutates business data. When scorecard writes are enabled, it inserts one row per evaluated action type with `eval_run_id`, `f1`, `precision`, `recall`, `priority_exact`, `unsafe_gate_rate`, and `sample_size`.

The golden labels are intentionally kept honest even when that lowers scores. Removing keyword-biased blocker labels dropped blocker-classification F1 to about `0.667` on the current truthful labels. That is the baseline a smarter classifier needs to beat.

Use the no-write eval command as the regression gate:

```bash
npm run test:eval
```

It fails when any action F1 is below the configured floor or when `unsafe_gate_rate` is greater than zero. The current blocker-action F1 is below the floor, so the CI gate fails by design. The intended fix is a better classifier and decision path, not lowering the floor.

## Autonomy Gates

Gates run through `scripts/gates.mjs` and read the latest `model_scorecard` row for each action type. No gate hardcodes that a specific action or segment should become a specific tier.

Promotion is slow. Passing evidence creates a pending policy change request, and a signed operator must approve it through the existing change-request flow before the tier changes.

Demotion is automatic and immediate. If scorecard evidence shows an unsafe gate rate or falls below the current tier floor, the gate applies the lower tier directly.

The asymmetry is intentional: promotion is a privilege earned narrowly and confirmed by a human; demotion is a protection applied broadly and instantly. Gate-driven requests and demotions include structured evidence: `eval_run_id`, `f1`, `unsafe_gate_rate`, `sample_size`, and `gate_run_id`.

## Architecture

```text
customer message
  -> deterministic triage + account lookup + optional model proposal
  -> policy decision
  -> action directives + autonomy policy
  -> post-sales executor
  -> PostgreSQL business tables + agent_actions audit

offline golden cases
  -> real triage and decision path
  -> action metrics + unsafe gate checks
  -> model_scorecard
  -> autonomy gates
  -> change requests or automatic demotions

CSV or synthetic connector fixture
  -> profile and normalize
  -> map and validate
  -> deterministic import
  -> canonical Linea schema
```

Core tables include `customers`, `accounts`, `account_contacts`, `cases`, `messages`, `case_events`, `implementation_steps`, `tasks`, `product_signals`, `account_health_events`, `agent_actions`, `action_autonomy_policy`, `action_autonomy_policy_audit`, `action_autonomy_policy_change_requests`, `agent_circuit_breakers`, and `model_scorecard`.

Models are optional. The default `MODEL_PROVIDER=deterministic` path requires no model server or paid API. Optional Ollama and OpenAI-compatible adapters can submit structured proposals, but model output is advisory only and cannot call repositories or write SQL.

For deeper design notes, see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/CONNECTORS.md](docs/CONNECTORS.md), and [docs/DEMO-SCENARIOS.md](docs/DEMO-SCENARIOS.md).

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Next.js development server. |
| `npm run build` | Build the Next.js app. |
| `npm run lint` | Run ESLint. |
| `npm run smoke` | Exercise the core intake demo flows against a running app. |
| `npm run db:reset` | Recreate the local schema and reload synthetic seed data. |
| `npm run eval` | Run offline eval and write `model_scorecard` rows. |
| `npm run test:eval` | Run offline eval without writing scorecards. |
| `npm run gates` | Evaluate scorecards against autonomy policies. |
| `npm run test:autonomy-gates` | Test promotion, demotion, ceilings, and policy exemptions. |
| `npm run test:autonomy-gate-runner` | Test gate execution against scorecards and policy rows. |
| `npm run test:autonomy-policy` | Test the tier decision ladder and guard behavior. |
| `npm run test:autonomy-policy-resolution` | Test approving and rejecting change requests. |
| `npm run test:action-directives` | Test directive construction and policy metadata. |
| `npm run test:agent-action-invariants` | Test persisted action-audit invariants. |
| `npm run test:imports` | Test CSV import validation and idempotency utilities. |
| `npm run test:connectors` | Test connector normalization and provenance. |
| `npx tsc --noEmit --pretty false` | Type-check the application. |

CSV onboarding commands:

```bash
npm run data:profile -- --dir docs/import-templates
npm run data:recommend-mapping -- --dir docs/import-templates
npm run import:csv -- --dir docs/import-templates \
  --mapping docs/import-templates/mapping.example.json --dry-run
npm run import:csv -- --dir docs/import-templates \
  --mapping docs/import-templates/mapping.example.json
```

Synthetic HubSpot-style fixture import:

```bash
npm run import:hubspot-fixture -- \
  --companies docs/connector-fixtures/hubspot-companies.json \
  --contacts docs/connector-fixtures/hubspot-contacts.json \
  --dry-run
```

## Status And Limitations

Linea is a local development project, not a production customer-data platform.

- All repository data and demos must remain synthetic.
- Policy Admin uses local single-operator authentication with signed sessions. It does not provide multi-user RBAC, MFA, centralized identity, tenant isolation, or production secret management.
- Triage is deterministic and keyword-based; it under-flags subtle review cases where no blocker keyword is present.
- Post-sales automation currently focuses on onboarding-blocker workflows for linked accounts.
- The offline eval set is small: 26 hand-labeled synthetic cases.
- F1 floors are deliberately lenient while the golden set is small and should rise as coverage grows.
- Automatic promotion is capped at `bounded` by design.
- The connector layer is a contract, local mock, and synthetic fixture importer only. There are no live SaaS connectors, OAuth flows, or external writebacks.
- Qdrant and n8n are present in Docker for future milestones but are not integrated with the app.
- There is no production migration, retention, privacy, or compliance system yet.

## License

MIT License. See [LICENSE](LICENSE).
