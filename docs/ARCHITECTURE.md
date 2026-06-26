# Architecture

Linea is currently a Next.js App Router application with a PostgreSQL-backed support case flow. The product direction is an AI post-sales command center that turns conversations into support cases, onboarding tasks, product signals, account health updates, and human follow-ups.

## Current Runtime Components

- Chat UI: `app/chat/page.tsx`
- Intake API: `app/api/intake/route.ts`
- Case history API: `app/api/cases/[case_number]/route.ts`
- Database pool: `lib/db.ts`
- Model provider layer: `lib/models`
- Agent planner: `lib/agent/planner.ts`
- Agent action audit repository: `lib/agent/repository.ts`
- Data onboarding scripts: `scripts/profile-csv.js`, `scripts/recommend-mapping.js`, and `scripts/import-csv.js`
- PostgreSQL schema: `sql/schema.sql`
- Demo knowledge base: `knowledge-base/smart-lock-battery.md`

## Current Flow

```text
/chat
  -> POST /api/intake
  -> deterministic triage
  -> account lookup
  -> optional structured model plan
  -> case restore/create
  -> message persistence
  -> post-sales automation
  -> agent action audit
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
8. The optional model planner can enrich the agent decision with a validated structured plan.
9. If a case number is provided, the route tries to restore a case owned by that customer.
10. If no matching case is found, a new case is created.
11. The route persists the customer message.
12. Rule-based post-sales automation checks for onboarding or go-live blocker language.
13. For a known account blocker, Linea creates or updates a task, product signal, and health event, then updates account health to `at_risk`.
14. Linea records executed, suggested, skipped, or failed policy actions in `agent_actions`.
15. The route persists a deterministic demo AI response.
16. The route updates the case activity timestamp.
17. The chat page requests `GET /api/cases/[case_number]`.
18. The case history route returns case metadata and ordered messages.
19. The chat page displays the latest response, account context, post-sales actions, and conversation timeline.

## Model Provider Layer

Linea is local-first and open-source-first. The model layer supports three paths:

1. **Deterministic fallback:** the default mode. It requires no model server, API key, or paid API and keeps the current workflow fully functional.
2. **Local model planner via Ollama:** the recommended model-powered path. Ollama runs an open-source model locally and returns a structured plan that enriches the deterministic agent decision.
3. **Optional hosted OpenAI-compatible adapter:** available for users who choose a compatible hosted API. It is an adapter, not a requirement or the default architecture.

The provider boundary is intentionally narrow. A model may classify a message and return a validated JSON plan containing confidence, urgency, a user-safe reasoning summary, and recommended actions. It never calls repositories, writes to PostgreSQL, or claims that actions were executed. Deterministic application policy remains responsible for deciding whether account-linked tasks, product signals, and health events may be created.

If a provider is missing configuration, fails, times out, or returns invalid JSON, the planner returns no model plan and intake continues with the deterministic decision.

## Agent Action Audit

`agent_actions` is Linea's durable audit layer between an agent recommendation and a database mutation. It records the case and account context, action type, outcome, decision source, confidence, user-safe reasoning, metadata, and execution time.

The model never writes SQL or calls a repository. It can only return a validated structured plan. The deterministic service and policy layer decides which recommendations are safe, repository functions perform approved writes, and the resulting outcomes are logged inside the same PostgreSQL transaction. Unknown-account blocker actions are skipped rather than applied to account-level tables, while human review is recorded as suggested until a human workflow actually accepts or assigns it.

This boundary prepares Linea for future approval queues and external tools: integrations can consume explicit action records without granting a model direct database access.

## Data Onboarding Agent

Linea keeps a stable canonical schema for accounts, customers, account contacts, implementation steps, cases, and messages. Source-specific columns do not become new database columns: reviewed mappings place custom account and case attributes into JSON `metadata`.

CSV onboarding has three explicit phases:

1. The profiler reads headers and sample rows, infers an entity type, and reports missing required fields.
2. The mapping recommender applies deterministic column heuristics first. An optional configured model may add review-only suggestions, but it cannot apply mappings, call repositories, or execute SQL.
3. The importer validates every required field and prints a preview. Only after validation, and only without `--dry-run`, deterministic parameterized repository code writes records inside one PostgreSQL transaction.

Accounts are upserted by name, customers by email, and contacts are linked through `account_contacts`. Implementation steps are upserted by account and step name. Imported cases receive a first customer message. This separation keeps the model advisory while preserving an auditable, deterministic mutation boundary.

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
- `accounts`: synthetic post-sales account records with stage, health status, and source-specific metadata.
- `account_contacts`: links synthetic customers to accounts.
- `implementation_steps`: onboarding or implementation work associated with an account and optional case.
- `tasks`: human follow-up work for customer success, support, or implementation teams.
- `product_signals`: structured product feedback, gaps, bugs, or requests surfaced from conversations.
- `account_health_events`: account-level health changes and risk events.
- `agent_actions`: audit records for recommended, executed, skipped, and failed agent actions.

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
