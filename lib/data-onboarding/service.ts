import "server-only";

import { createRequire } from "node:module";
import path from "node:path";
import type { PoolClient } from "pg";
import { pool } from "../db";

export type DataProfile = {
  file: string;
  entity_guess: string;
  columns: string[];
  row_count: number;
  sample_rows: Record<string, string>[];
  required_field_warnings: string[];
};

export type MappingEntity = {
  file: string;
  fields: Record<string, string>;
  metadata: Record<string, string>;
  confidence: number;
  needs_review: string[];
};

export type MappingRecommendation = {
  version: number;
  generated_by: string;
  entities: Record<string, MappingEntity>;
  confidence: number;
  needs_review: string[];
  model_review?: {
    suggestions: {
      file: string;
      column: string;
      recommended_field: string;
      reason: string;
      confidence: number | null;
    }[];
    notes: string[];
  };
};

type ImportRow = {
  source_row: number;
  record: Record<string, string>;
  metadata: Record<string, string>;
};

type ImportPlan = {
  entities: Record<
    string,
    {
      file: string;
      rows: ImportRow[];
    }
  >;
  errors: Record<string, unknown>[];
  warnings: Record<string, unknown>[];
  duplicateSourceRows: {
    accounts: Set<number>;
    contacts: Set<number>;
    cases: Set<number>;
  };
};

export type DataImportSummary = {
  accounts_created: number;
  accounts_updated: number;
  contacts_created: number;
  contacts_updated: number;
  account_links_created: number;
  account_links_skipped: number;
  implementation_steps_created: number;
  implementation_steps_updated: number;
  cases_created: number;
  cases_skipped_as_duplicates: number;
  messages_created: number;
  warnings: Record<string, unknown>[];
  validation_errors: Record<string, unknown>[];
};

const require = createRequire(import.meta.url);
const csvTools = require("../../scripts/csv-tools.js") as {
  profileCsvDirectory(directory: string): DataProfile[];
};
const importUtils = require("../../scripts/import-utils.js") as {
  normalizeAccountName(value: unknown): string;
  normalizeEmail(value: unknown): string;
  normalizeText(value: unknown): string;
  stableCaseIdentity(record: Record<string, string>): string;
};
const csvImporter = require("../../scripts/import-csv.js") as {
  readMapping(mappingPath: string): Record<string, unknown>;
  buildImportPlan(
    directory: string,
    mapping: Record<string, unknown>
  ): ImportPlan;
  executeImport(plan: ImportPlan): Promise<DataImportSummary>;
};
const mappingRecommender = require(
  "../../scripts/recommend-mapping.js"
) as {
  recommendMappings(
    profiles: DataProfile[]
  ): Promise<MappingRecommendation>;
};

const sampleDirectory = path.join(
  process.cwd(),
  "docs",
  "import-templates"
);
const sampleMappingPath = path.join(
  sampleDirectory,
  "mapping.example.json"
);

function buildSamplePlan() {
  const mapping = csvImporter.readMapping(sampleMappingPath);
  return csvImporter.buildImportPlan(sampleDirectory, mapping);
}

function getSuggestedEmail(plan: ImportPlan) {
  return (
    plan.entities.contacts?.rows.find((row) => row.record.email)?.record
      .email ?? null
  );
}

async function findAccount(
  client: PoolClient,
  accountName: string | undefined
) {
  if (!accountName) return null;

  const result = await client.query<{ id: number }>(
    `SELECT id
     FROM accounts
     WHERE REGEXP_REPLACE(LOWER(TRIM(name)), '\\s+', ' ', 'g') = $1
     ORDER BY id ASC
     LIMIT 1`,
    [importUtils.normalizeAccountName(accountName)]
  );

  return result.rows[0] ?? null;
}

async function findCustomer(
  client: PoolClient,
  email: string | undefined
) {
  if (!email) return null;

  const result = await client.query<{ id: number }>(
    `SELECT id
     FROM customers
     WHERE LOWER(TRIM(email)) = $1
     ORDER BY id ASC
     LIMIT 1`,
    [importUtils.normalizeEmail(email)]
  );

  return result.rows[0] ?? null;
}

async function buildDryRunSummary(
  client: PoolClient,
  plan: ImportPlan
): Promise<DataImportSummary> {
  const summary: DataImportSummary = {
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
  const plannedAccounts = new Set(
    (plan.entities.accounts?.rows ?? []).map((row) =>
      importUtils.normalizeAccountName(row.record.name)
    )
  );

  for (const row of plan.entities.accounts?.rows ?? []) {
    if (plan.duplicateSourceRows.accounts.has(row.source_row)) continue;
    const account = await findAccount(client, row.record.name);
    summary[account ? "accounts_updated" : "accounts_created"] += 1;
  }

  for (const row of plan.entities.contacts?.rows ?? []) {
    if (plan.duplicateSourceRows.contacts.has(row.source_row)) {
      summary.account_links_skipped += 1;
      continue;
    }

    const customer = await findCustomer(client, row.record.email);
    summary[customer ? "contacts_updated" : "contacts_created"] += 1;
    const account = await findAccount(client, row.record.account_name);
    const accountWillExist =
      account ||
      plannedAccounts.has(
        importUtils.normalizeAccountName(row.record.account_name)
      );

    if (!accountWillExist) {
      summary.account_links_skipped += 1;
      continue;
    }

    if (!account || !customer) {
      summary.account_links_created += 1;
      continue;
    }

    const existingLink = await client.query(
      `SELECT id
       FROM account_contacts
       WHERE account_id = $1 AND customer_id = $2
       LIMIT 1`,
      [account.id, customer.id]
    );
    summary[
      existingLink.rows[0]
        ? "account_links_skipped"
        : "account_links_created"
    ] += 1;
  }

  for (const row of plan.entities.implementation_steps?.rows ?? []) {
    const account = await findAccount(client, row.record.account_name);

    if (!account) {
      summary.implementation_steps_created += 1;
      continue;
    }

    const existingStep = await client.query(
      `SELECT id
       FROM implementation_steps
       WHERE account_id = $1
         AND REGEXP_REPLACE(LOWER(TRIM(step_name)), '\\s+', ' ', 'g') = $2
       LIMIT 1`,
      [
        account.id,
        importUtils.normalizeText(row.record.step_name),
      ]
    );
    summary[
      existingStep.rows[0]
        ? "implementation_steps_updated"
        : "implementation_steps_created"
    ] += 1;
  }

  for (const row of plan.entities.cases?.rows ?? []) {
    if (plan.duplicateSourceRows.cases.has(row.source_row)) {
      summary.cases_skipped_as_duplicates += 1;
      continue;
    }

    const identity = importUtils.stableCaseIdentity(row.record);
    const existingCase = await client.query(
      `SELECT id
       FROM cases
       WHERE metadata->>'import_identity' = $1
       LIMIT 1`,
      [identity]
    );
    if (existingCase.rows[0]) {
      summary.cases_skipped_as_duplicates += 1;
    } else {
      summary.cases_created += 1;
      summary.messages_created += 1;
    }
  }

  return summary;
}

export function profileSampleData() {
  return {
    mode: "sample",
    source: "docs/import-templates",
    profiles: csvTools.profileCsvDirectory(sampleDirectory),
  };
}

export async function recommendSampleMapping() {
  const profile = profileSampleData();
  const recommendation = await mappingRecommender.recommendMappings(
    profile.profiles
  );

  return {
    mode: "sample",
    source: profile.source,
    recommendation,
  };
}

export async function dryRunSampleImport() {
  const plan = buildSamplePlan();
  const client = await pool.connect();

  try {
    await client.query("BEGIN READ ONLY");
    const summary = await buildDryRunSummary(client, plan);
    await client.query("ROLLBACK");

    return {
      mode: "sample",
      dry_run: true,
      database_writes: 0,
      summary,
      suggested_test_email: getSuggestedEmail(plan),
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function importSampleData() {
  const plan = buildSamplePlan();
  if (plan.errors.length > 0) {
    throw new Error(
      "Sample import validation failed. Run the dry-run preview for details."
    );
  }
  const summary = await csvImporter.executeImport(plan);

  return {
    mode: "sample",
    dry_run: false,
    summary,
    suggested_test_email: getSuggestedEmail(plan),
  };
}
