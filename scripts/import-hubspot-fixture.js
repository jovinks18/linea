/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("node:fs");
const path = require("node:path");
const { Pool } = require("pg");
const {
  getArgument,
  hasFlag,
  loadLocalEnvironment,
} = require("./csv-tools");
const {
  normalizeAccountName,
  normalizeEmail,
} = require("./import-utils");

function readFixture(filePath, entity) {
  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const records = Array.isArray(parsed) ? parsed : parsed?.results;

  if (!Array.isArray(records)) {
    throw new Error(
      `${entity} fixture must be an array or contain a results array.`
    );
  }

  return records;
}

function canonicalString(record, field) {
  const value = record.canonical_fields[field];

  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return null;
}

function recordMetadata(record) {
  const metadata = {
    source: "hubspot_fixture",
    provenance: record.provenance,
    raw_payload: record.raw_payload,
    unmapped_properties: record.metadata.unmapped_properties ?? {},
  };

  for (const field of [
    "domain",
    "annual_revenue",
    "renewal_date",
    "health_score",
  ]) {
    const value = canonicalString(record, field);
    if (value !== null) metadata[field] = value;
  }

  return metadata;
}

function createSummary(plan) {
  return {
    companies_processed: plan.company_records.length,
    contacts_processed: plan.contact_records.length,
    accounts_created: 0,
    accounts_updated: 0,
    contacts_created: 0,
    contacts_updated: 0,
    links_created: 0,
    links_skipped: 0,
    warnings: [...plan.warnings],
    validation_errors: [...plan.validation_errors],
  };
}

function addWarning(summary, warning) {
  if (
    !summary.warnings.some(
      (existing) =>
        existing.entity === warning.entity &&
        existing.external_id === warning.external_id &&
        existing.message === warning.message
    )
  ) {
    summary.warnings.push(warning);
  }
}

async function findAccountByExternalId(client, externalId) {
  const result = await client.query(
    `SELECT id, name
     FROM accounts
     WHERE metadata->'provenance'->>'provider' = 'hubspot_fixture'
       AND metadata->'provenance'->>'external_id' = $1
     ORDER BY id ASC
     LIMIT 1`,
    [externalId]
  );

  return result.rows[0] ?? null;
}

async function findAccountForUpsert(client, record) {
  const externalId = record.provenance.external_id;
  const byExternalId = await findAccountByExternalId(client, externalId);
  if (byExternalId) return byExternalId;

  const domain = canonicalString(record, "domain");
  if (domain) {
    const byDomain = await client.query(
      `SELECT id, name
       FROM accounts
       WHERE LOWER(TRIM(metadata->>'domain')) = $1
       ORDER BY id ASC
       LIMIT 1`,
      [domain.toLowerCase()]
    );
    if (byDomain.rows[0]) return byDomain.rows[0];
  }

  const name = canonicalString(record, "name");
  if (!name) return null;

  const byName = await client.query(
    `SELECT id, name
     FROM accounts
     WHERE REGEXP_REPLACE(LOWER(TRIM(name)), '\\s+', ' ', 'g') = $1
     ORDER BY id ASC
     LIMIT 1`,
    [normalizeAccountName(name)]
  );

  return byName.rows[0] ?? null;
}

async function upsertAccount(client, record) {
  const existing = await findAccountForUpsert(client, record);
  const name = canonicalString(record, "name");
  const industry = canonicalString(record, "industry");
  const stage = canonicalString(record, "stage");
  const healthStatus = canonicalString(record, "health_status");
  const ownerName = canonicalString(record, "owner_name");
  const metadata = JSON.stringify(recordMetadata(record));

  if (existing) {
    await client.query(
      `UPDATE accounts SET
        name = COALESCE($1, name),
        industry = COALESCE($2, industry),
        stage = COALESCE($3, stage),
        health_status = COALESCE($4, health_status),
        owner_name = COALESCE($5, owner_name),
        metadata = COALESCE(metadata, '{}'::jsonb) || $6::jsonb,
        updated_at = NOW()
       WHERE id = $7`,
      [
        name,
        industry,
        stage,
        healthStatus,
        ownerName,
        metadata,
        existing.id,
      ]
    );

    return { id: existing.id, created: false };
  }

  const result = await client.query(
    `INSERT INTO accounts
      (name, industry, stage, health_status, owner_name, metadata)
     VALUES ($1, $2, COALESCE($3, 'onboarding'), COALESCE($4, 'unknown'), $5, $6)
     RETURNING id`,
    [name, industry, stage, healthStatus, ownerName, metadata]
  );

  return { id: result.rows[0].id, created: true };
}

async function upsertCustomer(client, record) {
  const email = normalizeEmail(canonicalString(record, "email"));
  const name = canonicalString(record, "name");
  const metadata = JSON.stringify(recordMetadata(record));
  const existing = await client.query(
    `SELECT id
     FROM customers
     WHERE LOWER(TRIM(email)) = $1
     ORDER BY id ASC
     LIMIT 1`,
    [email]
  );

  if (existing.rows[0]) {
    await client.query(
      `UPDATE customers SET
        name = COALESCE($1, name),
        preferred_channel = COALESCE(preferred_channel, 'hubspot_fixture'),
        metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb,
        updated_at = NOW()
       WHERE id = $3`,
      [name, metadata, existing.rows[0].id]
    );

    return { id: existing.rows[0].id, created: false };
  }

  const result = await client.query(
    `INSERT INTO customers
      (email, name, preferred_channel, metadata)
     VALUES ($1, $2, 'hubspot_fixture', $3)
     RETURNING id`,
    [email, name, metadata]
  );

  return { id: result.rows[0].id, created: true };
}

async function linkContactToAccount({
  client,
  accountId,
  customerId,
  contactRole,
}) {
  const existing = await client.query(
    `SELECT id
     FROM account_contacts
     WHERE account_id = $1 AND customer_id = $2
     LIMIT 1`,
    [accountId, customerId]
  );

  if (existing.rows[0]) {
    await client.query(
      `UPDATE account_contacts
       SET contact_role = COALESCE($1, contact_role), updated_at = NOW()
       WHERE id = $2`,
      [contactRole, existing.rows[0].id]
    );
    return false;
  }

  const result = await client.query(
    `INSERT INTO account_contacts
      (account_id, customer_id, contact_role, is_primary)
     VALUES ($1, $2, $3, TRUE)
     ON CONFLICT (account_id, customer_id) DO NOTHING
     RETURNING id`,
    [accountId, customerId, contactRole]
  );

  return result.rowCount === 1;
}

async function executeImport(plan) {
  loadLocalEnvironment();
  const { getDatabaseConfig } = await import("../lib/db-config.ts");
  const pool = new Pool(getDatabaseConfig());
  const client = await pool.connect();
  const summary = createSummary(plan);
  const importedAccounts = new Map();

  try {
    await client.query("BEGIN");

    for (const record of plan.valid_company_records) {
      const account = await upsertAccount(client, record);
      importedAccounts.set(record.provenance.external_id, account.id);
      summary[account.created ? "accounts_created" : "accounts_updated"] += 1;
    }

    for (const record of plan.valid_contact_records) {
      const customer = await upsertCustomer(client, record);
      summary[customer.created ? "contacts_created" : "contacts_updated"] += 1;

      const accountExternalId = canonicalString(
        record,
        "account_external_id"
      );
      if (!accountExternalId) {
        summary.links_skipped += 1;
        continue;
      }

      const importedAccountId = importedAccounts.get(accountExternalId);
      const existingAccount = importedAccountId
        ? { id: importedAccountId }
        : await findAccountByExternalId(client, accountExternalId);

      if (!existingAccount) {
        addWarning(summary, {
          entity: "contact",
          external_id: record.provenance.external_id,
          message: `Associated company ${accountExternalId} was not found; account link skipped.`,
        });
        summary.links_skipped += 1;
        continue;
      }

      const linkCreated = await linkContactToAccount({
        client,
        accountId: existingAccount.id,
        customerId: customer.id,
        contactRole: canonicalString(record, "contact_role"),
      });
      summary[linkCreated ? "links_created" : "links_skipped"] += 1;
    }

    await client.query("COMMIT");
    return summary;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

function previewPlan(plan) {
  return {
    phase: "preview",
    companies_processed: plan.company_records.length,
    contacts_processed: plan.contact_records.length,
    valid_companies: plan.valid_company_records.length,
    valid_contacts: plan.valid_contact_records.length,
    warnings: plan.warnings,
    validation_errors: plan.validation_errors,
    sample_records: [
      ...plan.company_records.slice(0, 1),
      ...plan.contact_records.slice(0, 1),
    ],
  };
}

async function main() {
  const companiesPath = getArgument("--companies");
  const contactsPath = getArgument("--contacts");
  const dryRun = hasFlag("--dry-run");

  if (!companiesPath || !contactsPath) {
    throw new Error("--companies and --contacts are required.");
  }

  const companies = readFixture(
    path.resolve(companiesPath),
    "Companies"
  );
  const contacts = readFixture(path.resolve(contactsPath), "Contacts");
  const { buildHubSpotFixturePlan } = await import(
    "../lib/connectors/hubspot.ts"
  );
  const plan = buildHubSpotFixturePlan({ companies, contacts });

  console.log(JSON.stringify(previewPlan(plan), null, 2));

  if (dryRun) {
    console.log(
      JSON.stringify(
        {
          phase: "complete",
          dry_run: true,
          database_writes: 0,
          imported: createSummary(plan),
        },
        null,
        2
      )
    );
    return;
  }

  const summary = await executeImport(plan);
  console.log(
    JSON.stringify(
      {
        phase: "complete",
        dry_run: false,
        imported: summary,
      },
      null,
      2
    )
  );
}

if (require.main === module) {
  main().catch((error) => {
    const details =
      error && typeof error === "object"
        ? {
            name: error.name,
            message: error.message,
            code: error.code,
            detail: error.detail,
            constraint: error.constraint,
          }
        : { message: String(error) };

    console.error(
      "HubSpot fixture import failed:",
      JSON.stringify(details)
    );
    process.exitCode = 1;
  });
}

module.exports = {
  linkContactToAccount,
  upsertAccount,
  upsertCustomer,
};
