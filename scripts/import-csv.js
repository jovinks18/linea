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
const {
  normalizeAccountName,
  normalizeEmail,
  normalizeText,
  stableCaseIdentity,
  validateImportPlan,
} = require("./import-utils");

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

  const validation = validateImportPlan(entities);
  const validationErrors = [...errors, ...validation.errors].filter(
    (error, index, allErrors) =>
      allErrors.findIndex(
        (candidate) =>
          candidate.entity === error.entity &&
          candidate.row === error.row &&
          candidate.error === error.error
      ) === index
  );

  return {
    entities,
    errors: validationErrors,
    warnings: validation.warnings,
    duplicateSourceRows: validation.duplicateSourceRows,
  };
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
    warnings: plan.warnings,
    errors: plan.errors,
  };
}

function createImportSummary(plan) {
  return {
    accounts_created: 0,
    accounts_updated: 0,
    contacts_created: 0,
    contacts_updated: 0,
    account_links_created: 0,
    account_links_skipped: 0,
    implementation_steps_created: 0,
    implementation_steps_updated: 0,
    cases_created: 0,
    cases_skipped_as_duplicates: 0,
    messages_created: 0,
    warnings: [...plan.warnings],
    validation_errors: [...plan.errors],
  };
}

function addWarning(summary, warning) {
  if (
    !summary.warnings.some(
      (existing) =>
        existing.entity === warning.entity &&
        existing.row === warning.row &&
        existing.warning === warning.warning
    )
  ) {
    summary.warnings.push(warning);
  }
}

async function upsertAccount(client, { record, metadata }) {
  const normalizedName = normalizeAccountName(record.name);
  const existing = await client.query(
    `SELECT id FROM accounts
     WHERE REGEXP_REPLACE(LOWER(TRIM(name)), '\\s+', ' ', 'g') = $1
     ORDER BY id ASC
     LIMIT 1`,
    [normalizedName]
  );
  const values = [
    record.industry ?? null,
    record.plan ?? null,
    record.stage ?? null,
    record.health_status?.toLowerCase() ?? null,
    record.owner_name ?? null,
    record.go_live_date ?? null,
    JSON.stringify(metadata),
  ];

  if (existing.rows[0]) {
    await client.query(
      `UPDATE accounts SET
        industry = COALESCE($1, industry),
        plan = COALESCE($2, plan),
        stage = COALESCE($3, stage),
        health_status = COALESCE($4, health_status),
        owner_name = COALESCE($5, owner_name),
        go_live_date = COALESCE($6, go_live_date),
        metadata = COALESCE(metadata, '{}'::jsonb) || $7::jsonb,
        updated_at = NOW()
       WHERE id = $8`,
      [...values, existing.rows[0].id]
    );

    return { id: existing.rows[0].id, created: false };
  }

  const result = await client.query(
    `INSERT INTO accounts
      (name, industry, plan, stage, health_status, owner_name, go_live_date, metadata)
     VALUES ($1, $2, $3, COALESCE($4, 'onboarding'), COALESCE($5, 'unknown'), $6, $7, $8)
     RETURNING id`,
    [
      record.name.trim(),
      values[0],
      values[1],
      values[2],
      values[3],
      values[4],
      values[5],
      values[6],
    ]
  );

  return { id: result.rows[0].id, created: true };
}

async function upsertCustomer(client, { email, name, preferredChannel }) {
  const normalizedEmail = normalizeEmail(email);
  const existing = await client.query(
    `SELECT id FROM customers
     WHERE LOWER(TRIM(email)) = $1
     ORDER BY id ASC
     LIMIT 1`,
    [normalizedEmail]
  );

  if (existing.rows[0]) {
    await client.query(
      `UPDATE customers SET
        name = COALESCE($1, name),
        preferred_channel = COALESCE(preferred_channel, $2),
        updated_at = NOW()
       WHERE id = $3`,
      [name?.trim() || null, preferredChannel ?? "import", existing.rows[0].id]
    );

    return { id: existing.rows[0].id, created: false };
  }

  const result = await client.query(
    `INSERT INTO customers (email, name, preferred_channel)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [normalizedEmail, name?.trim() || null, preferredChannel ?? "import"]
  );

  return { id: result.rows[0].id, created: true };
}

async function findAccount(client, accountName) {
  const result = await client.query(
    `SELECT id, name FROM accounts
     WHERE REGEXP_REPLACE(LOWER(TRIM(name)), '\\s+', ' ', 'g') = $1
     ORDER BY id ASC
     LIMIT 1`,
    [normalizeAccountName(accountName)]
  );

  return result.rows[0] ?? null;
}

async function importContact(client, { record, source_row }, summary) {
  const account = await findAccount(client, record.account_name);
  if (!account) {
    addWarning(summary, {
      entity: "contacts",
      row: source_row,
      warning: `Company "${record.account_name}" was not found; contact link skipped.`,
    });
    summary.account_links_skipped += 1;
    return;
  }

  const customer = await upsertCustomer(client, {
    email: record.email,
    name: record.name,
    preferredChannel: "import",
  });
  summary[customer.created ? "contacts_created" : "contacts_updated"] += 1;

  const existingLink = await client.query(
    `SELECT id FROM account_contacts
     WHERE account_id = $1 AND customer_id = $2`,
    [account.id, customer.id]
  );
  if (existingLink.rows[0]) {
    await client.query(
      `UPDATE account_contacts
       SET contact_role = COALESCE($1, contact_role), updated_at = NOW()
       WHERE id = $2`,
      [record.contact_role ?? null, existingLink.rows[0].id]
    );
    summary.account_links_skipped += 1;
    return;
  }

  const otherLinks = await client.query(
    `SELECT a.name
     FROM account_contacts ac
     JOIN accounts a ON a.id = ac.account_id
     WHERE ac.customer_id = $1
     ORDER BY ac.created_at ASC`,
    [customer.id]
  );
  if (otherLinks.rows.length > 0) {
    addWarning(summary, {
      entity: "contacts",
      row: source_row,
      warning: `Contact ${normalizeEmail(record.email)} is already linked to ${otherLinks.rows
        .map((row) => row.name)
        .join(", ")}; link to ${account.name} skipped.`,
    });
    summary.account_links_skipped += 1;
    return;
  }

  await client.query(
    `INSERT INTO account_contacts
      (account_id, customer_id, contact_role, is_primary)
     VALUES ($1, $2, $3, TRUE)`,
    [account.id, customer.id, record.contact_role ?? null]
  );
  summary.account_links_created += 1;
}

async function importImplementationStep(
  client,
  { record, metadata, source_row },
  summary
) {
  const account = await findAccount(client, record.account_name);
  if (!account) {
    addWarning(summary, {
      entity: "implementation_steps",
      row: source_row,
      warning: `Company "${record.account_name}" was not found; implementation step skipped.`,
    });
    return;
  }

  const existing = await client.query(
    `SELECT id FROM implementation_steps
     WHERE account_id = $1
       AND REGEXP_REPLACE(LOWER(TRIM(step_name)), '\\s+', ' ', 'g') = $2
     ORDER BY id ASC
     LIMIT 1`,
    [account.id, normalizeText(record.step_name)]
  );

  if (existing.rows[0]) {
    await client.query(
      `UPDATE implementation_steps SET
        status = COALESCE($1, status),
        owner_role = COALESCE($2, owner_role),
        due_date = COALESCE($3, due_date),
        metadata = COALESCE(metadata, '{}'::jsonb) || $4::jsonb,
        updated_at = NOW()
       WHERE id = $5`,
      [
        record.status?.toLowerCase() ?? null,
        record.owner_role ?? null,
        record.due_date ?? null,
        JSON.stringify(metadata),
        existing.rows[0].id,
      ]
    );
    summary.implementation_steps_updated += 1;
    return;
  }

  await client.query(
    `INSERT INTO implementation_steps
      (account_id, step_name, status, owner_role, due_date, metadata)
     VALUES ($1, $2, COALESCE($3, 'not_started'), $4, $5, $6)`,
    [
      account.id,
      record.step_name.trim(),
      record.status?.toLowerCase() ?? null,
      record.owner_role ?? null,
      record.due_date ?? null,
      JSON.stringify(metadata),
    ]
  );
  summary.implementation_steps_created += 1;
}

function generateImportedCaseNumber() {
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const suffix = crypto.randomUUID().slice(0, 8).toUpperCase();
  return `LIN-IMPORT-${date}-${suffix}`;
}

async function importCase(client, { record, metadata }, summary) {
  const customer = await upsertCustomer(client, {
    email: record.customer_email,
    preferredChannel: record.channel ?? "import",
  });
  const importIdentity = stableCaseIdentity(record);
  const duplicateByIdentity = await client.query(
    `SELECT id FROM cases
     WHERE metadata->>'import_identity' = $1
     LIMIT 1`,
    [importIdentity]
  );
  if (duplicateByIdentity.rows[0]) {
    summary.cases_skipped_as_duplicates += 1;
    return;
  }

  const duplicateLegacyCase = await client.query(
    `SELECT c.id
     FROM cases c
     JOIN messages m ON m.case_id = c.id
     WHERE c.customer_id = $1
       AND REGEXP_REPLACE(LOWER(TRIM(COALESCE(c.subject, ''))), '\\s+', ' ', 'g') = $2
       AND LOWER(TRIM(COALESCE(c.channel_origin, 'import'))) = $3
       AND REGEXP_REPLACE(LOWER(TRIM(m.message_text)), '\\s+', ' ', 'g') = $4
       AND m.sender_type = 'customer'
     ORDER BY c.id ASC
     LIMIT 1`,
    [
      customer.id,
      normalizeText(record.subject),
      normalizeText(record.channel || "import"),
      normalizeText(record.message),
    ]
  );
  if (duplicateLegacyCase.rows[0]) {
    await client.query(
      `UPDATE cases
       SET metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb,
           updated_at = NOW()
       WHERE id = $2`,
      [
        JSON.stringify({
          import_identity: importIdentity,
          import_source: "csv",
        }),
        duplicateLegacyCase.rows[0].id,
      ]
    );
    summary.cases_skipped_as_duplicates += 1;
    return;
  }

  const caseNumber = generateImportedCaseNumber();
  const caseMetadata = {
    ...metadata,
    import_identity: importIdentity,
    import_source: "csv",
  };
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
      customer.id,
      record.subject.trim(),
      record.status?.toLowerCase() ?? "open",
      record.priority?.toUpperCase() ?? "P2",
      normalizeText(record.channel || "import"),
      JSON.stringify(caseMetadata),
    ]
  );

  await client.query(
    `INSERT INTO messages
      (case_id, customer_id, channel, sender_type, message_text)
     VALUES ($1, $2, $3, 'customer', $4)`,
    [
      caseResult.rows[0].id,
      customer.id,
      normalizeText(record.channel || "import"),
      record.message,
    ]
  );
  summary.cases_created += 1;
  summary.messages_created += 1;
}

async function executeImport(plan) {
  loadLocalEnvironment();
  const { getDatabaseConfig } = await import("../lib/db-config.ts");
  const pool = new Pool(getDatabaseConfig());
  const client = await pool.connect();
  const summary = createImportSummary(plan);

  try {
    await client.query("BEGIN");

    for (const row of plan.entities.accounts?.rows ?? []) {
      if (plan.duplicateSourceRows.accounts.has(row.source_row)) continue;

      const account = await upsertAccount(client, row);
      summary[account.created ? "accounts_created" : "accounts_updated"] += 1;
    }

    for (const row of plan.entities.contacts?.rows ?? []) {
      if (plan.duplicateSourceRows.contacts.has(row.source_row)) {
        summary.account_links_skipped += 1;
        continue;
      }

      await importContact(client, row, summary);
    }

    for (const row of plan.entities.implementation_steps?.rows ?? []) {
      await importImplementationStep(client, row, summary);
    }

    for (const row of plan.entities.cases?.rows ?? []) {
      if (plan.duplicateSourceRows.cases.has(row.source_row)) {
        summary.cases_skipped_as_duplicates += 1;
        continue;
      }

      await importCase(client, row, summary);
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
  const summary = createImportSummary(plan);

  console.log(JSON.stringify(previewPlan(plan), null, 2));

  if (plan.errors.length > 0) {
    console.log(
      JSON.stringify(
        { phase: "complete", dry_run: dryRun, imported: summary },
        null,
        2
      )
    );
    process.exitCode = 1;
    return;
  }

  if (dryRun) {
    console.log(
      JSON.stringify(
        {
          phase: "complete",
          dry_run: true,
          database_writes: 0,
          imported: summary,
        },
        null,
        2
      )
    );
    return;
  }

  const importedSummary = await executeImport(plan);
  console.log(
    JSON.stringify(
      { phase: "complete", dry_run: false, imported: importedSummary },
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
      "CSV import failed:",
      JSON.stringify(details)
    );
    process.exitCode = 1;
  });
}

module.exports = {
  buildImportPlan,
  createImportSummary,
  executeImport,
  previewPlan,
  readMapping,
};
