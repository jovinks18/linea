# Architecture

Linea is currently a Next.js App Router application with a PostgreSQL-backed support case flow. The product direction is an AI post-sales command center that turns conversations into support cases, onboarding tasks, product signals, account health updates, and human follow-ups.

## Current Runtime Components

- Chat UI: `app/chat/page.tsx`
- Intake API: `app/api/intake/route.ts`
- Case history API: `app/api/cases/[case_number]/route.ts`
- Database pool: `lib/db.ts`
- PostgreSQL schema: `sql/schema.sql`
- Demo knowledge base: `knowledge-base/smart-lock-battery.md`

## Current Case Flow

```text
Chat UI
  -> POST /api/intake
  -> PostgreSQL customer lookup/create
  -> case restore/create
  -> message persistence
  -> demo AI response persistence
  -> GET /api/cases/[case_number]
  -> conversation history display
```

## Future Post-Sales Data Flow

```text
message
  -> case
  -> account
  -> implementation step
  -> task
  -> product signal
  -> health event
```

In the future architecture, an inbound customer message should do more than create a ticket. Linea should preserve the support case, connect it to the right synthetic account, identify whether an implementation or onboarding step is blocked, create the right human follow-up task, log any product signal, and update account health when the conversation indicates risk.

## Detailed Flow

1. A user opens `/chat` and enters a synthetic customer email, an optional case number, and a support message.
2. The chat page sends the message to `POST /api/intake`.
3. The intake route validates that `customer_email` and `message` are present.
4. PostgreSQL is queried for an existing customer by email.
5. If no customer exists, a synthetic customer record is created.
6. If a case number is provided, the route tries to restore a case owned by that customer.
7. If no matching case is found, a new case is created.
8. The route persists the customer message.
9. The route persists a deterministic demo AI response.
10. The route updates the case activity timestamp.
11. The chat page requests `GET /api/cases/[case_number]`.
12. The case history route returns case metadata and ordered messages.
13. The chat page displays the conversation timeline.

## Data Model

- `customers`: synthetic customer identities and preferred channel.
- `cases`: support case metadata such as case number, status, intent, sentiment, priority, and channel origin.
- `messages`: customer, AI, and future human-agent messages.
- `case_events`: timeline events such as case creation and future workflow or triage events.

## Planned Components

- Triage engine in `lib/triage`.
- Agent dashboard in `app/dashboard`.
- Post-sales account and onboarding context.
- Implementation-step and task tracking.
- Product signal capture.
- Account health events.
- Retrieval layer in `lib/rag`.
- Qdrant knowledge-base indexing.
- n8n workflow triggers and callbacks.
