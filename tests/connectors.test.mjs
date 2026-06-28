import assert from "node:assert/strict";
import fs from "node:fs";
import {
  normalizeMockRecord,
  runMockConnector,
} from "../lib/connectors/mock.ts";
import {
  buildHubSpotFixturePlan,
  normalizeHubSpotCompany,
  normalizeHubSpotContact,
} from "../lib/connectors/hubspot.ts";
import hubSpotImporter from "../scripts/import-hubspot-fixture.js";

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

const companiesFixture = JSON.parse(
  fs.readFileSync(
    new URL(
      "../docs/connector-fixtures/hubspot-companies.json",
      import.meta.url
    ),
    "utf8"
  )
).results;
const contactsFixture = JSON.parse(
  fs.readFileSync(
    new URL(
      "../docs/connector-fixtures/hubspot-contacts.json",
      import.meta.url
    ),
    "utf8"
  )
).results;

const hubSpotCompany = normalizeHubSpotCompany(
  companiesFixture[0],
  observedAt
);
assert.equal(hubSpotCompany.record_type, "account");
assert.equal(hubSpotCompany.canonical_fields.name, "Pinecrest Medical Group");
assert.equal(
  hubSpotCompany.canonical_fields.domain,
  "pinecrest-medical.example"
);
assert.equal(hubSpotCompany.provenance.provider, "hubspot_fixture");
assert.equal(hubSpotCompany.provenance.external_id, "hs_company_1001");
assert.equal(
  hubSpotCompany.metadata.unmapped_properties.implementation_region,
  "West"
);
assert.equal(
  hubSpotCompany.raw_payload.properties.annualrevenue,
  "2400000"
);

const hubSpotContact = normalizeHubSpotContact(
  contactsFixture[0],
  observedAt
);
assert.equal(hubSpotContact.record_type, "contact");
assert.equal(hubSpotContact.canonical_fields.email, "anna.wu@example.com");
assert.equal(hubSpotContact.canonical_fields.name, "Anna Wu");
assert.equal(
  hubSpotContact.canonical_fields.account_external_id,
  "hs_company_1001"
);
assert.equal(
  hubSpotContact.metadata.unmapped_properties.preferred_language,
  "English"
);

const hubSpotPlan = buildHubSpotFixturePlan({
  companies: companiesFixture,
  contacts: contactsFixture,
  observedAt,
});
assert.equal(hubSpotPlan.company_records.length, 2);
assert.equal(hubSpotPlan.contact_records.length, 3);
assert.equal(hubSpotPlan.valid_company_records.length, 2);
assert.equal(hubSpotPlan.valid_contact_records.length, 2);
assert.ok(
  hubSpotPlan.warnings.some(
    (issue) =>
      issue.external_id === "hs_contact_2002" &&
      issue.message.includes("missing required property: email")
  )
);
assert.ok(
  hubSpotPlan.validation_errors.some(
    (issue) =>
      issue.external_id === "hs_contact_2002" &&
      issue.message.includes("email")
  )
);
assert.ok(
  hubSpotPlan.warnings.some(
    (issue) =>
      issue.external_id === "hs_contact_2003" &&
      issue.message.includes("hs_company_missing")
  )
);

const repeatedHubSpotPlan = buildHubSpotFixturePlan({
  companies: companiesFixture,
  contacts: contactsFixture,
  observedAt,
});
assert.deepEqual(
  repeatedHubSpotPlan.valid_company_records.map(
    (record) => record.provenance.external_id
  ),
  hubSpotPlan.valid_company_records.map(
    (record) => record.provenance.external_id
  )
);
assert.deepEqual(
  repeatedHubSpotPlan.valid_contact_records.map(
    (record) => [
      record.canonical_fields.email,
      record.canonical_fields.account_external_id,
    ]
  ),
  hubSpotPlan.valid_contact_records.map(
    (record) => [
      record.canonical_fields.email,
      record.canonical_fields.account_external_id,
    ]
  )
);

function createQueuedClient(steps) {
  return {
    async query(sql) {
      const step = steps.shift();
      assert.ok(step, `Unexpected query: ${sql}`);
      assert.match(sql, step.pattern);
      return step.result;
    },
  };
}

const createdAccount = await hubSpotImporter.upsertAccount(
  createQueuedClient([
    { pattern: /metadata->'provenance'/, result: { rows: [] } },
    { pattern: /metadata->>'domain'/, result: { rows: [] } },
    { pattern: /REGEXP_REPLACE/, result: { rows: [] } },
    {
      pattern: /INSERT INTO accounts/,
      result: { rows: [{ id: 501 }], rowCount: 1 },
    },
  ]),
  hubSpotCompany
);
assert.deepEqual(createdAccount, { id: 501, created: true });

const updatedAccount = await hubSpotImporter.upsertAccount(
  createQueuedClient([
    {
      pattern: /metadata->'provenance'/,
      result: { rows: [{ id: 501, name: "Pinecrest Medical Group" }] },
    },
    { pattern: /UPDATE accounts/, result: { rows: [], rowCount: 1 } },
  ]),
  hubSpotCompany
);
assert.deepEqual(updatedAccount, { id: 501, created: false });

const createdCustomer = await hubSpotImporter.upsertCustomer(
  createQueuedClient([
    { pattern: /FROM customers/, result: { rows: [] } },
    {
      pattern: /INSERT INTO customers/,
      result: { rows: [{ id: 601 }], rowCount: 1 },
    },
  ]),
  hubSpotContact
);
assert.deepEqual(createdCustomer, { id: 601, created: true });

const updatedCustomer = await hubSpotImporter.upsertCustomer(
  createQueuedClient([
    { pattern: /FROM customers/, result: { rows: [{ id: 601 }] } },
    { pattern: /UPDATE customers/, result: { rows: [], rowCount: 1 } },
  ]),
  hubSpotContact
);
assert.deepEqual(updatedCustomer, { id: 601, created: false });

const createdLink = await hubSpotImporter.linkContactToAccount({
  client: createQueuedClient([
    { pattern: /FROM account_contacts/, result: { rows: [] } },
    {
      pattern: /INSERT INTO account_contacts/,
      result: { rows: [{ id: 701 }], rowCount: 1 },
    },
  ]),
  accountId: 501,
  customerId: 601,
  contactRole: "Director of Implementation",
});
assert.equal(createdLink, true);

const skippedDuplicateLink =
  await hubSpotImporter.linkContactToAccount({
    client: createQueuedClient([
      {
        pattern: /FROM account_contacts/,
        result: { rows: [{ id: 701 }] },
      },
      {
        pattern: /UPDATE account_contacts/,
        result: { rows: [], rowCount: 1 },
      },
    ]),
    accountId: 501,
    customerId: 601,
    contactRole: "Director of Implementation",
  });
assert.equal(skippedDuplicateLink, false);

console.log("PASS connector normalization and provenance");
