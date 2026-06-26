# Integrations

Linea currently runs in demo mode with synthetic data. The long-term goal is real workspace mode, where a company can connect its post-sales systems and let Linea turn customer conversations into cases, onboarding work, product signals, health updates, and human follow-ups.

## Demo Mode

Demo mode is for local development, product exploration, and open-source contribution.

- Uses only synthetic customers, accounts, cases, messages, tasks, and health events.
- Can be reset safely with Docker volumes.
- Should never contain real customer data, credentials, tokens, transcripts, or production exports.
- Uses `sql/schema.sql` for the database structure and `sql/seed.sql` for optional synthetic post-sales demo records.

## Real Workspace Mode

Real workspace mode is the future production path for companies using Linea with their own systems.

- Each workspace should configure its own data sources and credentials.
- Real data ingestion should be explicit, auditable, and reversible.
- Imports should preserve source IDs so records can be updated without creating duplicates.
- Sensitive fields should be minimized, redacted where possible, and protected by workspace-level access controls.
- Connectors should map external objects into Linea's post-sales model rather than forcing every source system to look alike.

## Future Ingestion Paths

### CSV Import

CSV import should be the first supported path because it is easy to inspect, test, and run without vendor-specific credentials.

Recommended imports:

- Accounts
- Contacts
- Cases
- Messages
- Onboarding steps
- Tasks
- Product signals
- Account health events

### API Import Endpoints

API import endpoints should come after CSV import. They should accept structured payloads from internal tools, scripts, or one-off migration jobs.

Recommended traits:

- Idempotent upserts using external source IDs.
- Validation before write.
- Dry-run mode.
- Per-workspace import logs.
- Clear error reporting for rejected rows or objects.

### Webhooks

Webhooks should support ongoing event ingestion once the import model is stable.

Recommended events:

- New or updated support ticket.
- New ticket comment.
- New onboarding blocker.
- New CSM task.
- Account health status changed.
- Product feedback captured.

### Native Connectors

Native connectors should come later, after the core import and webhook contracts are stable.

Potential connector categories:

- CRM systems.
- Support desks.
- Customer success platforms.
- Project management tools.
- Product feedback tools.
- Help centers and documentation systems.
- Communication channels.

### Direct Database Or Warehouse Sync

Direct database or warehouse sync should be used carefully for mature deployments that already centralize post-sales data.

Potential sources:

- Application databases.
- Customer data platforms.
- Data warehouses.
- Reverse ETL pipelines.

This path should be read-only by default and should use explicit table or view mappings.

## External System Mapping

| External system data | Linea destination |
| --- | --- |
| CRM accounts | `accounts` |
| CRM contacts | `customers` and `account_contacts` |
| Support tickets | `cases` |
| Ticket comments | `messages` |
| Onboarding plans | `implementation_steps` |
| CSM follow-ups | `tasks` |
| Feature requests, bugs, docs gaps | `product_signals` |
| Renewal or churn risk | `account_health_events` |
| Help center articles and docs | Knowledge base and Qdrant |

## Recommended Build Order

1. CSV import first.
2. API import endpoints second.
3. Webhooks third.
4. Native connectors later.

This order keeps the data model understandable before adding long-lived integrations and vendor-specific behavior.
