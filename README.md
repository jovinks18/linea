# Linea

Linea is an open-source AI post-sales command center. It turns customer conversations into support cases, onboarding tasks, product signals, account health updates, and human follow-ups.

The current repo is an early local demo. It uses only synthetic data and should never contain real customer data, secrets, tokens, or production credentials.

## Current Working Features

- Next.js App Router application with a working `/chat` demo page.
- `POST /api/intake` creates or restores a support case.
- `GET /api/cases/[case_number]` fetches case metadata and message history.
- PostgreSQL stores customers, cases, messages, and case events.
- PostgreSQL includes post-sales foundation tables for accounts, contacts, implementation steps, tasks, product signals, and account health events.
- Intake looks up linked account context through `account_contacts`.
- Rule-based automation detects onboarding blockers, creates a CSM task, logs a product signal, records a health event, and updates account health.
- The `/chat` demo shows the latest case, account context, and post-sales action status.
- Demo AI responses are persisted as messages.
- Docker Compose includes PostgreSQL, Qdrant, and n8n services.
- A sample knowledge-base article exists for smart lock battery troubleshooting.

## Product Direction

Linea starts from customer conversations, but the goal is broader than ticket handling. The command center should help post-sales teams see what every conversation means for the customer account:

- Support cases for immediate customer issues.
- Onboarding tasks for implementation blockers.
- Product signals for recurring gaps, bugs, and requests.
- Account health updates for risk, adoption, and lifecycle status.
- Human follow-ups for CSMs, support agents, and implementation teams.

## Tech Stack

- Next.js App Router
- TypeScript
- React
- Tailwind CSS
- PostgreSQL
- `pg` for database access
- Docker Compose
- Qdrant and n8n containers for planned future milestones

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Copy the environment template:

```bash
cp .env.example .env.local
```

3. Start the local services:

```bash
docker compose up -d
```

4. Load synthetic post-sales demo seed data:

```bash
docker compose exec -T postgres psql -U linea -d linea_db < sql/seed.sql
```

5. Start the development server:

```bash
npm run dev
```

6. Open the app:

```text
http://localhost:3000/chat
```

PostgreSQL is initialized from `sql/schema.sql` when the database volume is first created. The optional `sql/seed.sql` script adds synthetic post-sales accounts, contacts, onboarding steps, tasks, product signals, and account health events for demos.

> Database reset warning: existing Docker volumes do not automatically pick up schema changes. For a fresh local demo database, run `docker compose down -v` before starting Postgres again. This deletes local Docker volume data.

## Current Demo Flow

1. Open `/chat`.
2. Send a customer message from a synthetic customer email.
3. Linea creates or restores a support case.
4. Linea runs deterministic triage.
5. Linea looks up linked account context.
6. Linea persists the customer message and demo AI response.
7. If the message indicates an onboarding or go-live blocker for a known account, Linea creates post-sales actions.
8. The chat page loads case history from `GET /api/cases/[case_number]`.
9. The latest response card shows account context and post-sales action status.

Golden demo:

```text
customer_email: maya.chen@example.com
message: Our API setup is still blocked and we are supposed to go live Friday.
```

Expected result:

- A case is created or restored.
- Acme Clinics account context is shown.
- Onboarding blocker is detected.
- CSM task is created.
- Product signal is logged.
- Health event is created.
- Account health is updated to `at_risk`.

See `docs/DEMO-SCENARIOS.md` for suggested demo prompts.

## Smoke Test

With the app running, the local smoke test verifies the smart lock demo, API/go-live blocker demo, and unknown-account blocker demo.

```bash
docker compose up -d postgres
docker compose exec -T postgres psql -U linea -d linea_db < sql/seed.sql
npm run dev
```

In another terminal:

```bash
npm run smoke
```

## Using Your Own Data

Linea currently uses synthetic demo data only. Future real workspace mode will support company data ingestion through CSV imports, API import endpoints, webhooks, native connectors, and direct database or warehouse sync. See `docs/INTEGRATIONS.md` for the planned integration model and source-system mappings.

## Current Limitations

- All response generation is currently deterministic demo logic.
- The smart lock knowledge-base article is not connected to retrieval yet.
- Qdrant is available in Docker but not integrated with the app.
- n8n is available in Docker but not integrated with the app.
- There is no authentication or authorization yet.
- There is no agent dashboard yet.
- Post-sales automation is deterministic and currently limited to onboarding blocker detection.
- There is no production migration system yet.
- Database credentials are for local development only.

## Roadmap Summary

- v0.1: Cleanup and open-source readiness.
- v0.2: Triage engine.
- v0.3: Agent dashboard.
- v0.4: Post-sales account layer.
- v0.5: Product signals and account health.
- v0.6: Qdrant RAG and workflow integrations.

See `docs/ROADMAP.md` for more detail.
