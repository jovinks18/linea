/* eslint-disable @typescript-eslint/no-require-imports */
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { Pool } = require("pg");
const {
  ENTITY_DEFINITIONS,
  getArgument,
  hasFlag,
  loadLocalEnvironment,
  readCsvFile,
} = require("./csv-tools");

const IMPORT_ORDER = [
  "accounts",
  "contacts",
  "implementation_steps",
  "cases",
];

function readMapping(mappingPath) {
  const mapping = JSON.parse(fs.readFileSync(mappingPath, "utf8"));

  if (
    !mapping ||
    typeof mapping !== "object" ||
    !mapping.entities ||
    typeof mapping.entities !== "object"
  ) {
    throw new Error("Mapping must contain an entities object.");
  }

  return mapping;
}

function transformRow(row, mapping) {
  const record = Object.create(null);
  const metadata = Object.create(null);

  for (const [externalColumn, canonicalField] of Object.entries(
    mapping.fields ?? {}
  )) {
    const value = row[externalColumn];
    if (value !== undefined && value !== "") record[canonicalField] = value;
  }

  for (const [externalColumn, metadataField] of Object.entries(
    mapping.metadata ?? {}
  )) {
    const value = row[externalColumn];
    if (value !== undefined && value !== "") metadata[metadataField] = value;
  }

  return { record, metadata };
}

function buildImportPlan(directory, mappingConfig) {
  const entities = {};
  const errors = [];
  const resolvedDirectory = path.resolve(directory);

  for (const entity of IMPORT_ORDER) {
    const entityMapping = mappingConfig.entities[entity];
    if (!entityMapping) continue;

    if (typeof entityMapping.file !== "string" || !entityMapping.file) {
      errors.push({ entity, error: "Mapping is missing a CSV file name." });
      continue;
    }

    const filePath = path.resolve(resolvedDirectory, entityMapping.file);
    if (
      filePath !== resolvedDirectory &&
      !filePath.startsWith(`${resolvedDirectory}${path.sep}`)
    ) {
      errors.push({
        entity,
        file: entityMapping.file,
        error: "Mapped CSV file must stay inside the import directory.",
      });
      continue;
    }

    const allowedFields = new Set(
      Object.keys(ENTITY_DEFINITIONS[entity].aliases)
    );
    const invalidFields = Object.values(entityMapping.fields ?? {}).filter(
      (field) => typeof field !== "string" || !allowedFields.has(field)
    );
    const invalidMetadataFields = Object.values(
      entityMapping.metadata ?? {}
    ).filter(
      (field) =>
        typeof field !== "string" ||
        !field ||
        ["__proto__", "constructor", "prototype"].includes(field)
    );

    if (invalidFields.length > 0 || invalidMetadataFields.length > 0) {
      errors.push({
        entity,
        file: entityMapping.file,
        error: "Mapping contains an unsupported canonical or metadata field.",
      });
      continue;
    }

    const parsed = readCsvFile(filePath);
    const transformedRows = parsed.rows.map((row, index) => {
      const transformed = transformRow(row, entityMapping);
      const missingFields = ENTITY_DEFINITIONS[entity].required.filter(
        (field) => !transformed.record[field]
      );

      for (const field of missingFields) {
        errors.push({
          entity,
          file: entityMapping.file,
          row: index + 2,
          error: `Missing required field: ${field}`,
        });
      }

      return {
        source_row: index + 2,
        ...transformed,
      };
    });

    entities[entity] = {
      file: entityMapping.file,
      rows: transformedRows,
    };
  }

  return { entities, errors };
}

function previewPlan(plan) {
  const entitySummary = Object.fromEntries(
    Object.entries(plan.entities).map(([entity, value]) => [
      entity,
      {
        file: value.file,
        row_count: value.rows.length,
        sample: value.rows.slice(0, 2),
      },
    ])
  );

  return {
    phase: "preview",
    valid: plan.errors.length === 0,
    entities: entitySummary,
    errors: plan.errors,
  };
}

async function upsertAccount(client, { record, metadata }) {
  const result = await client.query(
    `INSERT INTO accounts
      (name, industry, plan, stage, health_status, owner_name, go_live_date, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (name) DO UPDATE SET
      industry = COALESCE(EXCLUDED.industry, accounts.industry),
      plan = COALESCE(EXCLUDED.plan, accounts.plan),
      stage = COALESCE(EXCLUDED.stage, accounts.stage),
      health_status = COALESCE(EXCLUDED.health_status, accounts.health_status),
      owner_name = COALESCE(EXCLUDED.owner_name, accounts.owner_name),
      go_live_date = COALESCE(EXCLUDED.go_live_date, accounts.go_live_date),
      metadata = accounts.metadata || EXCLUDED.metadata,
      updated_at = NOW()
     RETURNING id`,
    [
      record.name,
      record.industry ?? null,
      record.plan ?? null,
      record.stage ?? "onboarding",
      record.health_status ?? "unknown",
      record.owner_name ?? null,
      record.go_live_date ?? null,
      JSON.stringify(metadata),
    ]
  );

  return result.rows[0].id;
}

async function upsertCustomer(client, { email, name, preferredChannel }) {
  const result = await client.query(
    `INSERT INTO customers (email, name, preferred_channel)
     VALUES ($1, $2, $3)
     ON CONFLICT (email) DO UPDATE SET
      name = COALESCE(EXCLUDED.name, customers.name),
      preferred_channel = COALESCE(
        customers.preferred_channel,
        EXCLUDED.preferred_channel
      ),
      updated_at = NOW()
     RETURNING id`,
    [email, name ?? null, preferredChannel ?? "import"]
  );

  return result.rows[0].id;
}

async function findAccountId(client, accountName) {
  const result = await client.query(
    "SELECT id FROM accounts WHERE name = $1",
    [accountName]
  );

  if (!result.rows[0]) {
    throw new Error(`Account not found for imported row: ${accountName}`);
  }

  return result.rows[0].id;
}

async function importContact(client, { record }) {
  const accountId = await findAccountId(client, record.account_name);
  const customerId = await upsertCustomer(client, {
    email: record.email,
    name: record.name,
    preferredChannel: "import",
  });

  await client.query(
    `INSERT INTO account_contacts
      (account_id, customer_id, contact_role)
     VALUES ($1, $2, $3)
     ON CONFLICT (account_id, customer_id) DO UPDATE SET
      contact_role = EXCLUDED.contact_role,
      updated_at = NOW()`,
    [accountId, customerId, record.contact_role ?? null]
  );
}

async function importImplementationStep(client, { record, metadata }) {
  const accountId = await findAccountId(client, record.account_name);

  await client.query(
    `INSERT INTO implementation_steps
      (account_id, step_name, status, owner_role, due_date, metadata)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (account_id, step_name) DO UPDATE SET
      status = EXCLUDED.status,
      owner_role = EXCLUDED.owner_role,
      due_date = EXCLUDED.due_date,
      metadata = implementation_steps.metadata || EXCLUDED.metadata,
      updated_at = NOW()`,
    [
      accountId,
      record.step_name,
      record.status ?? "not_started",
      record.owner_role ?? null,
      record.due_date ?? null,
      JSON.stringify(metadata),
    ]
  );
}

function generateImportedCaseNumber() {
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const suffix = crypto.randomUUID().slice(0, 8).toUpperCase();
  return `LIN-IMPORT-${date}-${suffix}`;
}

async function importCase(client, { record, metadata }) {
  const customerId = await upsertCustomer(client, {
    email: record.customer_email,
    preferredChannel: record.channel ?? "import",
  });
  const caseNumber = generateImportedCaseNumber();
  const caseResult = await client.query(
    `INSERT INTO cases
      (
        case_number,
        customer_id,
        subject,
        status,
        priority,
        channel_origin,
        metadata
      )
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [
      caseNumber,
      customerId,
      record.subject,
      record.status ?? "open",
      record.priority ?? "P2",
      record.channel ?? "import",
      JSON.stringify(metadata),
    ]
  );

  await client.query(
    `INSERT INTO messages
      (case_id, customer_id, channel, sender_type, message_text)
     VALUES ($1, $2, $3, 'customer', $4)`,
    [
      caseResult.rows[0].id,
      customerId,
      record.channel ?? "import",
      record.message,
    ]
  );
}

async function executeImport(plan) {
  loadLocalEnvironment();
  const pool = new Pool({
    connectionString:
      process.env.DATABASE_URL ??
      "postgresql://linea:linea_password@localhost:5432/linea_db",
  });
  const client = await pool.connect();
  const summary = {};

  try {
    await client.query("BEGIN");

    for (const row of plan.entities.accounts?.rows ?? []) {
      await upsertAccount(client, row);
      summary.accounts = (summary.accounts ?? 0) + 1;
    }

    for (const row of plan.entities.contacts?.rows ?? []) {
      await importContact(client, row);
      summary.contacts = (summary.contacts ?? 0) + 1;
    }

    for (const row of plan.entities.implementation_steps?.rows ?? []) {
      await importImplementationStep(client, row);
      summary.implementation_steps =
        (summary.implementation_steps ?? 0) + 1;
    }

    for (const row of plan.entities.cases?.rows ?? []) {
      await importCase(client, row);
      summary.cases = (summary.cases ?? 0) + 1;
      summary.messages = (summary.messages ?? 0) + 1;
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

async function main() {
  const directory = path.resolve(
    getArgument("--dir", "docs/import-templates")
  );
  const mappingPath = path.resolve(
    getArgument(
      "--mapping",
      "docs/import-templates/mapping.example.json"
    )
  );
  const dryRun = hasFlag("--dry-run");
  const mapping = readMapping(mappingPath);
  const plan = buildImportPlan(directory, mapping);

  console.log(JSON.stringify(previewPlan(plan), null, 2));

  if (plan.errors.length > 0) {
    process.exitCode = 1;
    return;
  }

  if (dryRun) {
    console.log(
      JSON.stringify(
        { phase: "complete", dry_run: true, database_writes: 0 },
        null,
        2
      )
    );
    return;
  }

  const summary = await executeImport(plan);
  console.log(
    JSON.stringify(
      { phase: "complete", dry_run: false, imported: summary },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(
    "CSV import failed:",
    error instanceof Error ? error.message : error
  );
  process.exitCode = 1;
});
