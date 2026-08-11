# Connector Architecture

Linea's connector foundation prepares external post-sales data for safe ingestion without granting source systems or models direct access to business tables.

## Safety Boundary

Every connector should follow the same path:

```text
external source
  -> raw external record
  -> normalized record with provenance
  -> reviewed mapping and validation
  -> canonical Linea schema
  -> policy and execution envelope
  -> agent_actions audit
```

A connector reads and normalizes source data. It does not create cases, tasks, product signals, health events, or agent audit rows directly. Deterministic import services own canonical database writes. Any downstream agent action must pass through Linea's policy and execution boundary and produce an audit outcome.

Credentials, OAuth tokens, and source secrets do not belong in normalized records or provenance metadata.

## Workspace Modes

Linea currently runs in local demo mode with synthetic data only. Demo mode is
for development, product exploration, and open-source contribution. It should
never contain real customer data, credentials, tokens, transcripts, or
production exports.

Real workspace mode is a future production path. It should keep ingestion
explicit, auditable, reversible, and workspace-scoped. Each workspace should
configure its own sources and credentials, preserve external source IDs for
idempotency, minimize sensitive fields, and map source objects into Linea's
post-sales model rather than reshaping the canonical schema for every vendor.

## Record Contract

`lib/connectors/types.ts` defines the source-independent contract:

- `ConnectorSource` identifies the provider and source workspace without storing secrets.
- `ExternalRecord` preserves a source ID, original object type, source timestamps, and raw payload.
- `NormalizedExternalRecord` separates canonical field candidates, company-specific metadata, and provenance.
- `ConnectorSyncResult` summarizes one read-only normalization run.

Unknown external object types are retained as `unknown`, marked for review, and preserve their original type and payload. They are never silently discarded or written into an unrelated canonical table.

## Delivery Phases

### Phase 1: CSV And Data Onboarding

Keep CSV as the first production ingestion path. It already supports profiling, deterministic mapping recommendations, validation, dry runs, and controlled imports.

### Phase 2: Mock Connector Records

Use the local synthetic mock connector to stabilize record contracts, provenance, validation, and mapping behavior without credentials or network access. This phase does not write to PostgreSQL.

### Phase 3: One-Way SaaS Imports

Build one read-only SaaS adapter. Fetch source objects, retain external IDs and cursors, normalize them, and pass them into the reviewed mapping/import layer. Start with explicit manual syncs and dry-run previews.

### Phase 4: API Imports And Webhooks

Add structured API import endpoints and webhook ingestion after CSV and
one-way imports are stable. They should validate before write, support dry-run
or preview behavior where practical, preserve source IDs, and report rejected
records clearly. Useful events include new or updated support tickets, ticket
comments, onboarding blockers, CSM tasks, account-health changes, and product
feedback.

### Phase 5: Scheduled Sync

Add cursor-based incremental sync, retries, rate-limit handling, and durable sync-run records. Scheduled jobs remain one-way and idempotent.

### Phase 6: Native Connectors And Warehouse Reads

Native connectors should come after the import and webhook contracts are stable.
Potential categories include CRM, support desk, customer success, project
management, product feedback, help center, and communication systems. Direct
database or warehouse reads should stay read-only by default and use explicit
table or view mappings.

### Phase 7: Human-Approved Writeback

Only after read paths and audit controls are mature should Linea write back to an external system. Every writeback must show the proposed change, require policy approval or explicit human approval, use idempotency keys, and record execution in `agent_actions`.

## Canonical Mapping

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
| Help center articles and docs | Knowledge base and future retrieval layer |

## HubSpot-Style Fixture Importer

The HubSpot-style fixture importer is the first proof of the one-way connector contract. It reads synthetic company and contact JSON shaped like HubSpot responses, normalizes each record through `lib/connectors/hubspot.ts`, validates required fields, and then uses deterministic reconciliation code to write canonical `accounts`, `customers`, and `account_contacts`.

It is deliberately not a real HubSpot integration:

- It reads local synthetic fixture files only.
- It has no network client, OAuth flow, API key, token, webhook, or writeback path.
- The connector normalizer does not receive a database client.
- Only the import script performs reviewed, parameterized database writes.
- Invalid contacts are reported and skipped; missing company associations produce warnings.

Company reconciliation uses the HubSpot-style external ID first, domain second, and normalized account name last. Contacts reconcile by normalized email, and account links rely on the canonical uniqueness constraint. Provenance, raw fixture payloads, and unmapped properties are retained in metadata. This prepares the contract for future pagination, cursors, external-ID idempotency, and API reads without granting a connector direct mutation authority.

Preview the fixture without database writes:

```bash
npm run import:hubspot-fixture -- \
  --companies docs/connector-fixtures/hubspot-companies.json \
  --contacts docs/connector-fixtures/hubspot-contacts.json \
  --dry-run
```

Import the valid fixture records:

```bash
npm run import:hubspot-fixture -- \
  --companies docs/connector-fixtures/hubspot-companies.json \
  --contacts docs/connector-fixtures/hubspot-contacts.json
```

The included fixtures contain synthetic data only. A real HubSpot API adapter remains a future phase and must retain the same normalization, validation, policy, and audit boundaries.

## Connector Rules

- Never let connectors bypass mapping, validation, policy, or audit.
- Never let a model hold credentials or call connector mutation APIs.
- Preserve provider, source workspace, external record ID, original record type, and source timestamps.
- Store source-specific fields in metadata rather than expanding the canonical schema for each provider.
- Use stable external IDs and cursors for idempotency.
- Keep raw payload retention deliberate, minimized, and governed before real customer data is enabled.
