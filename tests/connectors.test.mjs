import assert from "node:assert/strict";
import {
  normalizeMockRecord,
  runMockConnector,
} from "../lib/connectors/mock.ts";

const observedAt = "2026-06-27T12:00:00.000Z";
const sync = runMockConnector(observedAt);

assert.equal(sync.source.provider, "mock");
assert.equal(sync.source.metadata.contains_synthetic_data_only, true);
assert.equal(sync.records.length, 5);
assert.equal(sync.received_count, sync.records.length);
assert.equal(sync.normalized_count, sync.records.length);
assert.equal(sync.unknown_count, 0);

assert.deepEqual(
  sync.records.map((record) => record.record_type),
  ["account", "contact", "case", "message", "usage_event"]
);

for (const record of sync.records) {
  assert.equal(
    record.provenance.connector_source_id,
    sync.source.id
  );
  assert.equal(record.provenance.provider, "mock");
  assert.ok(record.provenance.external_id);
  assert.ok(record.provenance.external_record_type);
  assert.equal(record.provenance.observed_at, observedAt);
}

const unknownRecord = normalizeMockRecord(
  {
    external_id: "renewal_forecast_001",
    record_type: "renewal_forecast",
    payload: {
      account_external_id: "acct_harbor_health",
      forecast: "at_risk",
    },
  },
  observedAt
);

assert.equal(unknownRecord.record_type, "unknown");
assert.equal(
  unknownRecord.metadata.original_record_type,
  "renewal_forecast"
);
assert.equal(unknownRecord.metadata.needs_review, true);
assert.equal(
  unknownRecord.canonical_fields.account_external_id,
  "acct_harbor_health"
);
assert.equal(
  unknownRecord.provenance.external_record_type,
  "renewal_forecast"
);

console.log("PASS connector normalization and provenance");
