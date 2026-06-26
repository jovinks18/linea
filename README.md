# Linea

Linea is an open-source AI post-sales command center. It turns customer conversations into support cases, onboarding tasks, product signals, account health updates, and human follow-ups.

The current repo is an early local demo. It uses only synthetic data and should never contain real customer data, secrets, tokens, or production credentials.

## Current Working Features

- Next.js App Router application with a working `/chat` demo page.
- `POST /api/intake` creates or restores a support case.
- `GET /api/cases/[case_number]` fetches case metadata and message history.
- PostgreSQL stores customers, cases, messages, and case events.
- PostgreSQL includes post-sales foundation tables for accounts, contacts, implementation steps, tasks, product signals, and account health events.
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

## Demo Flow

1. Open `/chat`.
2. Use a synthetic customer email such as `maya.chen@example.com`.
3. Send a smart lock support message.
4. Linea creates or restores a case.
5. Linea stores the customer message and a demo AI response.
6. The chat page loads the case timeline from `GET /api/cases/[case_number]`.
7. Send another message with the same case number to continue the case history.

See `docs/DEMO-SCENARIOS.md` for suggested demo prompts.

## Using Your Own Data

Linea currently uses synthetic demo data only. Future real workspace mode will support company data ingestion through CSV imports, API import endpoints, webhooks, native connectors, and direct database or warehouse sync. See `docs/INTEGRATIONS.md` for the planned integration model and source-system mappings.

## Current Limitations

- All response generation is currently deterministic demo logic.
- The smart lock knowledge-base article is not connected to retrieval yet.
- Qdrant is available in Docker but not integrated with the app.
- n8n is available in Docker but not integrated with the app.
- There is no authentication or authorization yet.
- There is no agent dashboard yet.
- The account, onboarding, task, product signal, and health-event tables are present, but app behavior does not use them yet.
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
