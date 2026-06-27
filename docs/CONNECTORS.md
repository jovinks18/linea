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

### Phase 4: Scheduled Sync

Add cursor-based incremental sync, retries, rate-limit handling, and durable sync-run records. Scheduled jobs remain one-way and idempotent.

### Phase 5: Human-Approved Writeback

Only after read paths and audit controls are mature should Linea write back to an external system. Every writeback must show the proposed change, require policy approval or explicit human approval, use idempotency keys, and record execution in `agent_actions`.

## Connector Rules

- Never let connectors bypass mapping, validation, policy, or audit.
- Never let a model hold credentials or call connector mutation APIs.
- Preserve provider, source workspace, external record ID, original record type, and source timestamps.
- Store source-specific fields in metadata rather than expanding the canonical schema for each provider.
- Use stable external IDs and cursors for idempotency.
- Keep raw payload retention deliberate, minimized, and governed before real customer data is enabled.
