import "server-only";

import fs from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import type { PoolClient } from "pg";
import { pool } from "../db";

export type DataSourceMode = "sample" | "upload";
export type UploadEntity =
  | "accounts"
  | "contacts"
  | "implementation_steps"
  | "cases";

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
  parseCsv(text: string): {
    columns: string[];
    rows: Record<string, string>[];
  };
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
  buildDeterministicMapping(
    profiles: DataProfile[]
  ): MappingRecommendation;
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
const uploadRoot = path.join(os.tmpdir(), "linea-data-onboarding");
const uploadLifetimeMs = 24 * 60 * 60 * 1000;
const maxFileBytes = 2 * 1024 * 1024;
const sessionIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const uploadFileNames: Record<UploadEntity, string> = {
  accounts: "accounts.csv",
  contacts: "contacts.csv",
  implementation_steps: "implementation_steps.csv",
  cases: "cases.csv",
};

function assertSessionId(sessionId: string) {
  if (!sessionIdPattern.test(sessionId)) {
    throw new Error("The upload session is invalid.");
  }
}

function getUploadDirectory(sessionId: string) {
  assertSessionId(sessionId);
  return path.join(uploadRoot, sessionId);
}

async function cleanupExpiredUploads() {
  await fs.mkdir(uploadRoot, { recursive: true });
  const entries = await fs.readdir(uploadRoot, { withFileTypes: true });
  const expiration = Date.now() - uploadLifetimeMs;

  await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const directory = path.join(uploadRoot, entry.name);
        const stats = await fs.stat(directory);

        if (stats.mtimeMs < expiration) {
          await fs.rm(directory, { force: true, recursive: true });
        }
      })
  );
}

function getDatasetDirectory(
  mode: DataSourceMode,
  sessionId?: string | null
) {
  if (mode === "sample") return sampleDirectory;
  if (!sessionId) throw new Error("An upload session is required.");

  return getUploadDirectory(sessionId);
}

function buildDatasetPlan(
  mode: DataSourceMode,
  directory: string
): ImportPlan {
  const mapping =
    mode === "sample"
      ? csvImporter.readMapping(sampleMappingPath)
      : mappingRecommender.buildDeterministicMapping(
          csvTools.profileCsvDirectory(directory)
        );

  return csvImporter.buildImportPlan(directory, mapping);
}

function profileDataset(
  mode: DataSourceMode,
  directory: string,
  source: string
) {
  const profiles = csvTools.profileCsvDirectory(directory);
  const plan = buildDatasetPlan(mode, directory);

  return {
    mode,
    source,
    profiles,
    warnings: plan.warnings,
    validation_errors: plan.errors,
  };
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

export async function storeUploadedDataset({
  sessionId,
  files,
}: {
  sessionId: string;
  files: Partial<Record<UploadEntity, File>>;
}) {
  assertSessionId(sessionId);
  await cleanupExpiredUploads();

  for (const requiredEntity of ["accounts", "contacts"] as const) {
    if (!files[requiredEntity]) {
      throw new Error(
        `${uploadFileNames[requiredEntity]} is required.`
      );
    }
  }

  const validatedFiles: {
    entity: UploadEntity;
    contents: Uint8Array;
  }[] = [];

  for (const entity of Object.keys(uploadFileNames) as UploadEntity[]) {
    const file = files[entity];
    if (!file) continue;

    if (!file.name.toLowerCase().endsWith(".csv")) {
      throw new Error(`${file.name} must be a CSV file.`);
    }
    if (file.size === 0) {
      throw new Error(`${file.name} is empty.`);
    }
    if (file.size > maxFileBytes) {
      throw new Error(`${file.name} exceeds the 2 MB local limit.`);
    }

    const contents = new Uint8Array(await file.arrayBuffer());
    const text = new TextDecoder().decode(contents);
    const parsed = csvTools.parseCsv(text);

    if (parsed.columns.length === 0 || parsed.rows.length === 0) {
      throw new Error(
        `${file.name} must contain a header and at least one data row.`
      );
    }

    validatedFiles.push({ entity, contents });
  }

  const directory = getUploadDirectory(sessionId);
  await fs.rm(directory, { force: true, recursive: true });
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });

  await Promise.all(
    validatedFiles.map(({ entity, contents }) =>
      fs.writeFile(
        path.join(directory, uploadFileNames[entity]),
        contents,
        { mode: 0o600 }
      )
    )
  );

  return profileDataset("upload", directory, "Local upload session");
}

export function profileSampleData() {
  return profileDataset(
    "sample",
    sampleDirectory,
    "docs/import-templates"
  );
}

export function profileUploadedData(sessionId: string) {
  const directory = getUploadDirectory(sessionId);
  return profileDataset("upload", directory, "Local upload session");
}

export async function recommendDatasetMapping({
  mode,
  sessionId,
}: {
  mode: DataSourceMode;
  sessionId?: string | null;
}) {
  const profile =
    mode === "sample"
      ? profileSampleData()
      : profileUploadedData(sessionId ?? "");
  const recommendation = await mappingRecommender.recommendMappings(
    profile.profiles
  );

  return {
    mode,
    source: profile.source,
    recommendation,
  };
}

export async function dryRunDatasetImport({
  mode,
  sessionId,
}: {
  mode: DataSourceMode;
  sessionId?: string | null;
}) {
  const directory = getDatasetDirectory(mode, sessionId);
  const plan = buildDatasetPlan(mode, directory);
  const client = await pool.connect();

  try {
    await client.query("BEGIN READ ONLY");
    const summary = await buildDryRunSummary(client, plan);
    await client.query("ROLLBACK");

    return {
      mode,
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

export async function importDataset({
  mode,
  sessionId,
}: {
  mode: DataSourceMode;
  sessionId?: string | null;
}) {
  const directory = getDatasetDirectory(mode, sessionId);
  const plan = buildDatasetPlan(mode, directory);
  if (plan.errors.length > 0) {
    throw new Error(
      "Import validation failed. Run the dry-run preview for details."
    );
  }
  const summary = await csvImporter.executeImport(plan);

  return {
    mode,
    dry_run: false,
    summary,
    suggested_test_email: getSuggestedEmail(plan),
  };
}
