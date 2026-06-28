# Linea

**A local-first, supervised AI workspace for post-sales operations.**

Linea turns customer messages into structured cases, account context, post-sales actions, and an auditable agent activity trail. It is an early open-source project built to explore how support, customer success, implementation, and product teams can supervise agents that act on customer accounts.

## What Linea Does

Linea currently:

- Ingests customer messages and creates or restores support cases.
- Links known customers to accounts and surfaces account metadata and KPIs.
- Detects support issues, onboarding blockers, and account risk with deterministic rules.
- Creates CSM tasks, product signals, and health events for eligible account-linked blockers.
- Records executed, suggested, skipped, and failed actions in `agent_actions`.
- Shows case context, agent decisions, post-sales actions, and recent activity in `/chat` and `/dashboard`.
- Profiles, maps, validates, and idempotently imports CSV data into a canonical post-sales schema.
- Defines a normalized, provenance-aware foundation for future CRM, support, and product connectors.

## Why It Exists

Post-sales work is fragmented across conversations, tickets, CRM records, onboarding plans, product feedback, and health scores. Agents can help connect those signals, but only if operators can see what the agent understood, what it proposed, what actually executed, and where human review is required.

Linea treats supervision and auditability as core product behavior rather than an afterthought.

## Core Capabilities

- **Support intake:** deterministic triage, case memory, message history, and account lookup.
- **Post-sales automation:** onboarding-blocker detection with controlled task, signal, and health mutations.
- **Agent supervision:** structured decisions with classification, confidence, reasoning summaries, recommendations, execution outcomes, and human-review state.
- **Durable audit:** action records survive business-transaction failures and remain visible in the Agent Activity feed.
- **Data onboarding:** CSV profiling, mapping recommendations, dry-run validation, metadata preservation, and idempotent imports.
- **Connector foundation:** source-independent normalized records and provenance contracts, without live SaaS access or unsafe writes.
- **Optional model planning:** local Ollama or hosted OpenAI-compatible providers can submit structured proposals; deterministic fallback requires no model.

## Architecture

```text
customer message
  -> triage + account context + optional model proposal
  -> deterministic policy/execution envelope
  -> approved repository actions
  -> PostgreSQL + agent_actions audit
  -> supervised Chat and Command Center UI

CSV or future connector
  -> profile/normalize
  -> map + validate
  -> deterministic importer
  -> canonical Linea schema
```

The canonical schema covers customers, accounts, cases, messages, implementation steps, tasks, product signals, health events, and agent actions. Source-specific fields remain in JSON metadata instead of expanding the schema for every system.

See [Architecture](docs/ARCHITECTURE.md) and [Connector Architecture](docs/CONNECTORS.md) for deeper design details.

## Safety Model

- Models produce validated proposals only. They cannot call repositories or write to PostgreSQL.
- Deterministic policy decides which actions are allowed.
- Repository code performs approved mutations inside explicit transactions.
- `agent_actions` records the authoritative executed, suggested, skipped, or failed outcome.
- Account-level automation is blocked when no linked account exists.
- Failed post-sales actions are audited through a separate connection after rollback.
- Demo data is synthetic. Never add real customer data, secrets, tokens, or production exports.

Deterministic mode is the default and requires no paid API:

```dotenv
MODEL_PROVIDER=deterministic
```

Ollama is the recommended optional local-model path. Hosted OpenAI-compatible APIs are supported as adapters, not requirements.

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
docker compose exec -T postgres psql -U linea -d linea_db < sql/seed.sql
npm run dev
```

Open:

- Home: [http://localhost:3000](http://localhost:3000)
- Chat Intake: [http://localhost:3000/chat](http://localhost:3000/chat)
- Command Center: [http://localhost:3000/dashboard](http://localhost:3000/dashboard)
- Data Onboarding: [http://localhost:3000/data](http://localhost:3000/data)

`DATABASE_URL` is optional. Without it, the app and CSV importer use the local Docker PostgreSQL defaults.

> PostgreSQL initialization runs only when its Docker volume is first created. After schema changes, `docker compose down -v` resets the local database and deletes all local volume data.

## Useful Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Next.js development server |
| `npm run smoke` | Exercise the three core intake demo flows |
| `npm run lint` | Run ESLint |
| `npx tsc --noEmit --pretty false` | Type-check the application |
| `npm run test:triage` | Test deterministic triage and case subjects |
| `npm run test:agent-actions` | Test policy, execution, and audit behavior |
| `npm run test:imports` | Test import validation and idempotency utilities |
| `npm run test:connectors` | Test connector normalization and provenance |

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
lib/agent/            Decisions, policy, execution, and audit
lib/connectors/       Normalized connector contracts and mock source
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

- No authentication, authorization, tenant isolation, or production secret management.
- Post-sales automation currently focuses on deterministic onboarding-blocker workflows.
- The connector layer is a contract and synthetic mock only; no live SaaS connectors or OAuth exist.
- Qdrant and n8n are available in Docker but are not integrated with the application.
- There is no production migration, retention, privacy, or compliance system yet.
- All repository data and demos must remain synthetic.

## License

MIT License. See [LICENSE](LICENSE).
