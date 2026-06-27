export type ConnectorRecordType =
  | "account"
  | "contact"
  | "case"
  | "message"
  | "task"
  | "product_signal"
  | "usage_event"
  | "unknown";

export type ConnectorSource = {
  id: string;
  provider: string;
  name: string;
  mode: "mock" | "manual" | "scheduled" | "webhook";
  workspace_external_id?: string | null;
  metadata: Record<string, unknown>;
};

export type ExternalRecord = {
  external_id: string;
  record_type: string;
  payload: Record<string, unknown>;
  source_updated_at?: string | null;
  source_url?: string | null;
};

export type ConnectorProvenance = {
  connector_source_id: string;
  provider: string;
  external_id: string;
  external_record_type: string;
  source_updated_at: string | null;
  source_url: string | null;
  observed_at: string;
};

export type NormalizedExternalRecord = {
  record_type: ConnectorRecordType;
  canonical_fields: Record<string, unknown>;
  metadata: Record<string, unknown>;
  provenance: ConnectorProvenance;
};

export type ConnectorSyncResult = {
  source: ConnectorSource;
  records: NormalizedExternalRecord[];
  received_count: number;
  normalized_count: number;
  unknown_count: number;
  warnings: string[];
  started_at: string;
  completed_at: string;
  next_cursor: string | null;
};
