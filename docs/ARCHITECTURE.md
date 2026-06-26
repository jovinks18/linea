# Architecture

Linea is currently a Next.js App Router application with a PostgreSQL-backed support case flow. The product direction is an AI post-sales command center that turns conversations into support cases, onboarding tasks, product signals, account health updates, and human follow-ups.

## Current Runtime Components

- Chat UI: `app/chat/page.tsx`
- Intake API: `app/api/intake/route.ts`
- Case history API: `app/api/cases/[case_number]/route.ts`
- Database pool: `lib/db.ts`
- PostgreSQL schema: `sql/schema.sql`
- Demo knowledge base: `knowledge-base/smart-lock-battery.md`

## Current Flow

```text
/chat
  -> POST /api/intake
  -> deterministic triage
  -> account lookup
  -> case restore/create
  -> message persistence
  -> post-sales automation
  -> demo AI response persistence
  -> response UI with account context and action status
  -> GET /api/cases/[case_number]
  -> conversation history display
```

## Post-Sales Data Flow

```text
message
  -> case
  -> account
  -> implementation step
  -> task
  -> product signal
  -> health event
```

An inbound customer message can now do more than create a ticket. Linea preserves the support case, connects it to the right synthetic account when one exists, identifies whether an implementation or onboarding step is blocked, creates a human follow-up task, logs a product signal, and updates account health when the conversation indicates risk.

## Detailed Flow

1. A user opens `/chat` and enters a synthetic customer email, an optional case number, and a support message.
2. The chat page sends the message to `POST /api/intake`.
3. The intake route validates that `customer_email` and `message` are present.
4. Deterministic triage classifies subject, intent, sentiment, and priority.
5. PostgreSQL is queried for an existing customer by email.
6. If no customer exists, a synthetic customer record is created.
7. Account context is looked up through `account_contacts`.
8. If a case number is provided, the route tries to restore a case owned by that customer.
9. If no matching case is found, a new case is created.
10. The route persists the customer message.
11. Rule-based post-sales automation checks for onboarding or go-live blocker language.
12. For a known account blocker, Linea creates or updates a task, product signal, and health event, then updates account health to `at_risk`.
13. The route persists a deterministic demo AI response.
14. The route updates the case activity timestamp.
15. The chat page requests `GET /api/cases/[case_number]`.
16. The case history route returns case metadata and ordered messages.
17. The chat page displays the latest response, account context, post-sales actions, and conversation timeline.

## Automation Notes

Post-sales automation currently uses deterministic rule-based detection. Messages containing phrases such as `blocked`, `go live`, `go-live`, `implementation`, `setup not working`, `API setup`, or `cannot launch` are treated as onboarding blockers when the customer is linked to an account.

The current schema is intentionally simple. Some product concepts are mapped into existing columns:

- Task ownership is stored in `tasks.owner_role`, even when the value is an account owner name.
- Task due timing is stored in `tasks.due_date`.
- Product area is included in `product_signals.description`.
- Health transition details such as previous status, new status, and reason are stored in `account_health_events.metadata`.

## Data Model

- `customers`: synthetic customer identities and preferred channel.
- `cases`: support case metadata such as case number, status, intent, sentiment, priority, and channel origin.
- `messages`: customer, AI, and future human-agent messages.
- `case_events`: timeline events such as case creation and future workflow or triage events.
- `accounts`: synthetic post-sales account records with stage and health status.
- `account_contacts`: links synthetic customers to accounts.
- `implementation_steps`: onboarding or implementation work associated with an account and optional case.
- `tasks`: human follow-up work for customer success, support, or implementation teams.
- `product_signals`: structured product feedback, gaps, bugs, or requests surfaced from conversations.
- `account_health_events`: account-level health changes and risk events.

## Planned Components

- Triage engine in `lib/triage`.
- Agent dashboard in `app/dashboard`.
- Richer post-sales account and onboarding context.
- Expanded implementation-step and task tracking.
- Expanded product signal capture.
- Expanded account health events.
- Retrieval layer in `lib/rag`.
- Qdrant knowledge-base indexing.
- n8n workflow triggers and callbacks.
