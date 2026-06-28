import type {
  ConnectorRecordType,
  ConnectorSource,
  ConnectorSyncResult,
  ExternalRecord,
  NormalizedExternalRecord,
} from "./types";

const supportedRecordTypes = new Set<ConnectorRecordType>([
  "account",
  "contact",
  "case",
  "message",
  "task",
  "product_signal",
  "usage_event",
  "unknown",
]);

export const mockConnectorSource: ConnectorSource = {
  id: "mock-post-sales",
  provider: "mock",
  name: "Synthetic Post-Sales Workspace",
  mode: "mock",
  workspace_external_id: "workspace_synthetic_001",
  metadata: {
    environment: "local_demo",
    contains_synthetic_data_only: true,
  },
};

export function normalizeMockRecord(
  record: ExternalRecord,
  observedAt = new Date().toISOString()
): NormalizedExternalRecord {
  const recordType = supportedRecordTypes.has(
    record.record_type as ConnectorRecordType
  )
    ? (record.record_type as ConnectorRecordType)
    : "unknown";

  return {
    record_type: recordType,
    raw_payload: { ...record.payload },
    canonical_fields: { ...record.payload },
    metadata:
      recordType === "unknown"
        ? {
            needs_review: true,
            original_record_type: record.record_type,
          }
        : {},
    provenance: {
      connector_source_id: mockConnectorSource.id,
      provider: mockConnectorSource.provider,
      external_id: record.external_id,
      external_record_type: record.record_type,
      source_updated_at: record.source_updated_at ?? null,
      source_url: record.source_url ?? null,
      observed_at: observedAt,
    },
  };
}

export function createMockConnectorRecords(
  observedAt = new Date().toISOString()
): NormalizedExternalRecord[] {
  const rawRecords: ExternalRecord[] = [
    {
      external_id: "acct_harbor_health",
      record_type: "account",
      payload: {
        name: "Harbor Health Systems",
        industry: "Healthcare",
        plan: "Growth",
        stage: "onboarding",
        health_status: "watch",
        owner_name: "Jordan Lee",
      },
      source_updated_at: "2026-06-20T10:00:00.000Z",
    },
    {
      external_id: "contact_lena_ortiz",
      record_type: "contact",
      payload: {
        email: "lena.ortiz@example.com",
        name: "Lena Ortiz",
        role: "Implementation Lead",
        account_external_id: "acct_harbor_health",
      },
      source_updated_at: "2026-06-20T10:05:00.000Z",
    },
    {
      external_id: "case_api_launch",
      record_type: "case",
      payload: {
        customer_external_id: "contact_lena_ortiz",
        subject: "Implementation blocker - API launch",
        status: "open",
        priority: "P1",
        channel: "support",
      },
      source_updated_at: "2026-06-21T09:00:00.000Z",
    },
    {
      external_id: "message_api_launch",
      record_type: "message",
      payload: {
        case_external_id: "case_api_launch",
        sender_type: "customer",
        message:
          "Our sandbox API setup is blocked before the synthetic launch date.",
      },
      source_updated_at: "2026-06-21T09:01:00.000Z",
    },
    {
      external_id: "usage_harbor_health_week_25",
      record_type: "usage_event",
      payload: {
        account_external_id: "acct_harbor_health",
        event_type: "usage_score_changed",
        usage_score: 42,
        health_signal: "declining",
      },
      source_updated_at: "2026-06-22T08:00:00.000Z",
    },
  ];

  return rawRecords.map((record) =>
    normalizeMockRecord(record, observedAt)
  );
}

export function runMockConnector(
  observedAt = new Date().toISOString()
): ConnectorSyncResult {
  const records = createMockConnectorRecords(observedAt);

  return {
    source: mockConnectorSource,
    records,
    received_count: records.length,
    normalized_count: records.length,
    unknown_count: records.filter(
      (record) => record.record_type === "unknown"
    ).length,
    warnings: [],
    started_at: observedAt,
    completed_at: observedAt,
    next_cursor: null,
  };
}
