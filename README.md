# Linea

A supervised agent runtime for post-sales operations. The model proposes, policy decides, the executor acts, audit records facts, and a human supervises.

Autonomy is granted per action type, never to "the agent" as a whole, and it is earned rather than assumed. An offline eval harness scores the real decision path against a hand-labeled golden set and writes the result to a scorecard. Gates read that scorecard and move autonomy tiers on evidence: promotion is slow and requires human approval, demotion is automatic and immediate. Every tier change is auditable back to the exact eval run that caused it.

Automatic promotion is capped at "bounded" by design. Nothing in this system promotes itself to fully autonomous.

## Try it in two minutes

```bash
git clone https://github.com/jovinks18/linea
cd linea
npm ci
cp .env.example .env.local
docker compose up -d postgres
npm run dev
```

Then open [http://localhost:3000/chat](http://localhost:3000/chat) and send both demo messages:

1. `maya.chen@example.com`, "Our API setup is still blocked and we are supposed to go live Friday." This resolves to a verified account and executes the post-sales actions within policy.
2. Any unrecognized email, same message. This creates the case, holds every account action, and queues it for human review.

Open the case pages side by side. The difference between them is the product.

## What Linea Does

Linea currently:

- Ingests customer messages and creates or restores support cases.
- Links known customers to accounts and surfaces account metadata and KPIs.
- Detects support issues, onboarding blockers, and account risk with deterministic rules.
- Creates CSM tasks, product signals, and health events for eligible account-linked blockers.
- Routes proposed agent actions through an autonomy policy ladder by `action_type` and account segment.
- Runs offline golden-set evals against the real triage and `decide()` paths, then writes `model_scorecard` evidence for gates.
- Moves policy tiers from scorecard evidence only: promotions become human-reviewed change requests, while demotions apply immediately.
- Records executed, suggested, skipped, and failed actions in `agent_actions`.
- Shows case context, agent decisions, post-sales actions, and recent activity in `/chat` and `/dashboard`.
- Profiles, maps, validates, and idempotently imports CSV data into a canonical post-sales schema.
- Defines a normalized, provenance-aware foundation for future CRM, support, and product connectors.

## Core Capabilities

- **Support intake:** deterministic triage, case memory, message history, and account lookup.
- **Post-sales automation:** onboarding-blocker detection with controlled task, signal, and health mutations.
- **Agent supervision:** structured decisions with classification, confidence, reasoning summaries, recommendations, execution outcomes, and human-review state.
- **Autonomy governance:** per-action and per-segment policy tiers with guardrails for confidence, blast radius, reversibility, and circuit breakers.
- **Offline evaluation:** a hand-labeled golden set that exercises the real deterministic triage and `decide()` paths before producing scorecards.
- **Evidence-based gates:** policy tiers move only from eval evidence; promotion is slow and human-approved, demotion is automatic and audited.
- **Durable audit:** action records survive business-transaction failures and remain visible in the Agent Activity feed.
- **Data onboarding:** CSV profiling, mapping recommendations, dry-run validation, metadata preservation, and idempotent imports.
- **Connector foundation:** source-independent normalized records and provenance contracts, without live SaaS access or unsafe writes.
- **Optional model planning:** local Ollama or hosted OpenAI-compatible providers can submit structured proposals; deterministic fallback requires no model.

## Architecture

```text
customer message
  -> triage + account context + optional model proposal
  -> deterministic policy decision + autonomy directives
  -> approved repository actions
  -> PostgreSQL + agent_actions audit
  -> supervised Chat and Command Center UI

offline golden cases
  -> real triage + policy decision + decide() paths
  -> action metrics + unsafe gate checks
  -> model_scorecard evidence
  -> autonomy gates + audited policy change requests/demotions

CSV or future connector
  -> profile/normalize
  -> map + validate
  -> deterministic importer
  -> canonical Linea schema
```

The canonical schema covers customers, accounts, cases, messages, implementation steps, tasks, product signals, health events, autonomy policies, policy audit records, policy change requests, scorecards, and agent actions. Source-specific fields remain in JSON metadata instead of expanding the schema for every system.

See [Architecture](docs/ARCHITECTURE.md) and [Connector Architecture](docs/CONNECTORS.md) for deeper design details.

## Safety Model

- Models produce validated proposals only. They cannot call repositories or write to PostgreSQL.
- Deterministic policy decides which actions are allowed, and execution is deny-by-default when a governed policy row is missing.
- Repository code performs approved mutations inside explicit transactions.
- `agent_actions` records the authoritative executed, suggested, skipped, or failed outcome.
- Account-level automation is blocked when no linked account exists.
- Failed post-sales actions are audited through a separate connection after rollback.
- Policy edits and approvals derive actor identity from a signed, HttpOnly operator session. API callers cannot submit audit actor fields.
- Governance actions are audited with structured policy snapshots and, when gate-driven, scorecard evidence.
- Demo data is synthetic. Never add real customer data, secrets, tokens, or production exports.

Deterministic mode is the default and requires no paid API:

```dotenv
MODEL_PROVIDER=deterministic
```

Ollama is the recommended optional local-model path. Hosted OpenAI-compatible APIs are supported as adapters, not requirements.

## Autonomy Policy Ladder

Linea does not grant autonomy to "the agent" as a whole. Autonomy is granted per `action_type` plus segment (`linked_account`, `unknown_account`, or default). Each governed policy row has a tier:

- `shadow`: never executes; records a counterfactual suggestion.
- `supervised`: never executes automatically; queues or suggests human review.
- `bounded`: executes only when all guards pass.
- `autonomous`: represented in the schema and decision code, but automatic promotion to this tier is deliberately capped.

Execution is deny-by-default: a governed action executes only if its directive allows it. Bounded and autonomous decisions still have to pass the same guard envelope: confidence floor, maximum blast radius, reversibility requirement, and circuit-breaker state. If there is no matching segment/default policy, Linea falls back to a restrictive supervised policy with a confidence floor of `1`, blast radius `0`, and reversible-only execution.

Automatic promotion is deliberately capped at `bounded`. Nothing promotes itself to `autonomous`.

The `unknown_account` segment has a promotion ceiling. It can move from `shadow` to `supervised`, but never into auto-execution, regardless of score. The operator-facing rule is plain: actions auto-execute only for verified linked accounts; unknown accounts hold for human review. Without a linked account, Linea should not automatically mutate account-level records, create account-scoped tasks, or treat ambiguous identity as resolved.

Policy edits use the existing change-request flow. Manual approvals, rejections, simulations, and gate-generated promotion requests all leave audit records.

## Policy-Exempt Actions

Two actions are intentionally outside the guard-controlled policy ladder:

- `create_support_case` is the intake prerequisite. The case is the container the audit trail lives in, so it is always executed and never guard-checked.
- `require_human_review` is the safe fallback: defer to a human. It is never guard-checked because guarding the safe action would mean the system could fail to ask for help, which is backwards.

These exemptions are narrow. They do not allow account-level post-sales mutations.

## Offline Evaluation Harness

The offline eval harness loads `lib/eval/golden`, currently 26 hand-labeled synthetic cases, including deliberate near-misses. The labels are hand-authored because you cannot benchmark against data where the correct answer is unknown, and model-generated labels would only measure model-vs-model agreement.

The harness runs the real deterministic triage path, builds the real policy decision, and calls the same action-directive/`decide()` path used by runtime execution. It is not a copied evaluator. It also aborts unless `MODEL_PROVIDER=deterministic`, so the result is repeatable for local regression checks.

Eval runs are read-only except for `model_scorecard`. Before running cases, the harness fingerprints guarded business tables; after scoring, it fingerprints them again and fails if the eval mutated customer, case, policy, audit, task, signal, health, breaker, or action data.

`npm run eval` writes one `model_scorecard` row per governed action type with:

- `f1`
- `precision`
- `recall`
- `priority_exact`
- `unsafe_gate_rate`
- `sample_size`

Use `npm run test:eval` as the no-write CI gate. It fails on any governed action F1 below the configured floor or any `unsafe_gate_rate > 0`. The README does not print F1 numbers as a selling point; run the command to inspect the current scorecard behavior yourself.

## Autonomy Gates

Tiers move on `model_scorecard` evidence only. No gate hardcodes that a particular action type or segment should receive a specific tier. Gates read the latest scorecard per action type and then evaluate each non-exempt policy row.

Promotion is slow and requires human approval through the existing change-request flow. Passing evidence creates a pending change request; it does not directly raise the tier.

Demotion is automatic, immediate, and never waits for approval. If `unsafe_gate_rate` is positive or F1 falls below the current tier floor, the gate applies the lower tier directly.

The asymmetry is intentional: promotion is a privilege earned narrowly and confirmed by a human; demotion is a protection applied broadly and instantly.

Every gate-driven tier change or promotion request writes structured evidence: `eval_run_id`, `f1`, `unsafe_gate_rate`, `sample_size`, and `gate_run_id`. Any tier movement is traceable back to the exact eval run and gate run that caused it.

Automatic promotion is capped at `bounded`. Even when a scorecard would satisfy the configured `autonomous` floor, the gate records a hold instead of creating a bounded-to-autonomous request.

## Data Onboarding

The Data Onboarding Agent helps inspect CSV exports before any write occurs.
The `/data` workspace supports either the synthetic sample templates or
session-scoped CSV uploads. Uploaded files stay in operating-system temporary
storage, are never committed, and expire automatically. This local project
must still use synthetic data only.

```bash
npm run data:profile -- --dir docs/import-templates
npm run data:recommend-mapping -- --dir docs/import-templates
npm run import:csv -- --dir docs/import-templates \
  --mapping docs/import-templates/mapping.example.json --dry-run
npm run import:csv -- --dir docs/import-templates \
  --mapping docs/import-templates/mapping.example.json
```

Mapping recommendations are review-only. The deterministic importer validates and writes data; custom fields such as ARR, renewal date, and usage score are stored in metadata.

## Quickstart

Requirements: Node.js, npm, Docker, and Docker Compose.

```bash
npm ci
cp .env.example .env.local
docker compose up -d postgres
npm run dev
```

Before opening Policy Admin, set these local-only values in `.env.local`:

```dotenv
LINEA_ADMIN_USERNAME=your-local-operator-name
LINEA_ADMIN_PASSWORD=use-a-long-local-password
LINEA_SESSION_SECRET=generate-a-random-secret-of-at-least-32-characters
```

For example, `openssl rand -hex 32` generates a suitable session secret.
Credentials and populated secrets must never be committed.

Open:

- Home: [http://localhost:3000](http://localhost:3000)
- Chat Intake: [http://localhost:3000/chat](http://localhost:3000/chat)
- Command Center: [http://localhost:3000/dashboard](http://localhost:3000/dashboard)
- Data Onboarding: [http://localhost:3000/data](http://localhost:3000/data)
- Policy Admin: [http://localhost:3000/admin/policies](http://localhost:3000/admin/policies)

`DATABASE_URL` is optional. Without it, the app and CSV importer use the local Docker PostgreSQL defaults.

Fresh Docker initialization loads both `sql/schema.sql` and `sql/seed.sql`, so the known-account demo works immediately after the Postgres container starts.

> PostgreSQL initialization runs only when its Docker volume is first created. After schema changes, `docker compose down -v` resets the local database and deletes all local volume data.

To reset and reseed the local database without deleting Docker volumes:

```bash
npm run db:reset
```

## Useful Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Next.js development server |
| `npm run db:reset` | Recreate the local schema and reload synthetic seed data |
| `npm run smoke` | Exercise the three core intake demo flows |
| `npm run eval` | Run offline eval and write `model_scorecard` rows |
| `npm run gates` | Evaluate scorecards against autonomy policies and create promotion requests or automatic demotions |
| `npm run lint` | Run ESLint |
| `npx tsc --noEmit --pretty false` | Type-check the application |
| `npm run test:triage` | Test deterministic triage and case subjects |
| `npm run test:agent-actions` | Test policy, execution, and audit behavior |
| `npm run test:agent-action-invariants` | Test persisted agent-action invariants |
| `npm run test:action-directives` | Test action directive construction and policy metadata |
| `npm run test:blast-radius` | Test blast-radius classification for proposed actions |
| `npm run test:circuit-breaker` | Test circuit-breaker state and action suppression |
| `npm run test:eval` | Run offline eval without writing scorecards |
| `npm run test:eval-runner` | Test eval loading, scoring, and mutation guards |
| `npm run test:autonomy-gates` | Test promotion, demotion, policy-exempt actions, unknown-account ceilings, and autonomous caps |
| `npm run test:autonomy-gate-runner` | Test gate execution against scorecards and policies |
| `npm run test:autonomy-policy` | Test the tier decision ladder and guard behavior |
| `npm run test:autonomy-policy-audit` | Test policy audit normalization and evidence |
| `npm run test:autonomy-policy-edit` | Test authenticated policy edits |
| `npm run test:autonomy-policy-validation` | Test policy update validation |
| `npm run test:autonomy-policy-list` | Test policy listing and exempt-action filtering |
| `npm run test:autonomy-policy-risk` | Test policy risk summaries |
| `npm run test:autonomy-policy-change-requests` | Test policy change-request lifecycle |
| `npm run test:autonomy-policy-simulation` | Test policy impact simulation |
| `npm run test:autonomy-policy-impact` | Test change-request impact previews |
| `npm run test:autonomy-policy-resolution` | Test approving and rejecting change requests |
| `npm run test:autonomy-ui` | Test autonomy UI formatting helpers |
| `npm run test:imports` | Test import validation and idempotency utilities |
| `npm run test:connectors` | Test connector normalization and provenance |
| `npm run test:operator-auth` | Test signed operator sessions and server-bound audit attribution |

## Demo Flows

The primary post-sales demo uses:

```text
Email: maya.chen@example.com
Message: Our API setup is still blocked and we are supposed to go live Friday.
```

Linea links the message to Acme Clinics, classifies an implementation blocker, creates the permitted post-sales actions, updates account health to `at_risk`, and exposes the resulting audit trail.

The smart-lock and unknown-account scenarios demonstrate support routing and safe action suppression. See [Demo Scenarios](docs/DEMO-SCENARIOS.md) for exact prompts and expected outcomes.

## Project Structure

```text
app/                  Next.js pages and API routes
components/           Shared supervision UI components
lib/agent/            Decisions, autonomy policy, gates, execution, and audit
lib/connectors/       Normalized connector contracts and mock source
lib/eval/             Golden-set offline evaluation and scorecard types
lib/intake/           Intake orchestration
lib/post-sales/       Deterministic post-sales automation
lib/*/repository.ts   PostgreSQL access boundaries
scripts/              CSV onboarding and smoke-test tools
sql/                  Schema and synthetic seed data
docs/                 Architecture, demos, connectors, and roadmap
```

## Roadmap

Current priorities include deeper supervision controls, read-only connector ingestion, retrieval-backed responses, workflow integration, and production hardening. See the [Roadmap](docs/ROADMAP.md).

## Status And Limitations

Linea is a local development project, not a production-ready customer-data platform.

- Policy Admin has local single-operator authentication with signed sessions. It does not yet provide multi-user RBAC, MFA, centralized identity, tenant isolation, or production secret management.
- Post-sales automation currently focuses on deterministic onboarding-blocker workflows.
- The offline eval set is small: 26 hand-labeled synthetic cases. It is useful for regression checks, not for accuracy claims.
- F1 floors are deliberately lenient while the golden set is small. They should rise as the set grows and covers more segments and edge cases.
- Automatic promotion is capped at `bounded` by design. The `autonomous` tier exists in the schema and decision code, but gates do not promote into it.
- Triage is deterministic and keyword-based; it under-flags subtle review cases where no blocker keyword is present.
- The connector layer is a contract and synthetic mock only; no live SaaS connectors or OAuth exist.
- Qdrant and n8n are available in Docker but are not integrated with the application.
- There is no production migration, retention, privacy, or compliance system yet.
- All repository data and demos must remain synthetic.

## License

MIT License. See [LICENSE](LICENSE).
