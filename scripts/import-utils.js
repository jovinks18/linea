/* eslint-disable @typescript-eslint/no-require-imports */
const crypto = require("node:crypto");

const CASE_PRIORITIES = new Set(["P0", "P1", "P2", "P3"]);
const CASE_STATUSES = new Set(["open", "pending", "closed"]);
const HEALTH_STATUSES = new Set([
  "unknown",
  "healthy",
  "watch",
  "at_risk",
]);
const IMPLEMENTATION_STATUSES = new Set([
  "not_started",
  "in_progress",
  "blocked",
  "completed",
]);

function normalizeText(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function normalizeEmail(value) {
  return normalizeText(value);
}

function normalizeAccountName(value) {
  return normalizeText(value);
}

function isValidDate(value) {
  if (!value) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function stableCaseIdentity(record) {
  const identity = [
    normalizeEmail(record.customer_email),
    normalizeText(record.subject),
    normalizeText(record.channel || "import"),
    normalizeText(record.message),
  ].join("\u001f");

  return crypto.createHash("sha256").update(identity).digest("hex");
}

function validateImportPlan(entities) {
  const warnings = [];
  const errors = [];
  const duplicateSourceRows = {
    accounts: new Set(),
    contacts: new Set(),
    cases: new Set(),
  };
  const accountNames = new Map();
  const contactEmails = new Map();
  const caseIdentities = new Map();

  for (const row of entities.accounts?.rows ?? []) {
    const normalizedName = normalizeAccountName(row.record.name);

    if (accountNames.has(normalizedName)) {
      warnings.push({
        entity: "accounts",
        row: row.source_row,
        warning: `Duplicate account name; first seen on row ${accountNames.get(normalizedName)}.`,
      });
      duplicateSourceRows.accounts.add(row.source_row);
    } else if (normalizedName) {
      accountNames.set(normalizedName, row.source_row);
    }

    if (
      row.record.health_status &&
      !HEALTH_STATUSES.has(row.record.health_status.toLowerCase())
    ) {
      errors.push({
        entity: "accounts",
        row: row.source_row,
        error: `Invalid health status: ${row.record.health_status}`,
      });
    }

    for (const [field, value] of [
      ["go_live_date", row.record.go_live_date],
      ["renewal_date", row.metadata.renewal_date],
    ]) {
      if (!isValidDate(value)) {
        errors.push({
          entity: "accounts",
          row: row.source_row,
          error: `Invalid ${field}: ${value}`,
        });
      }
    }
  }

  for (const row of entities.contacts?.rows ?? []) {
    const normalizedEmail = normalizeEmail(row.record.email);
    const existing = contactEmails.get(normalizedEmail);

    if (existing) {
      warnings.push({
        entity: "contacts",
        row: row.source_row,
        warning: `Duplicate contact email; first seen on row ${existing.row}.`,
      });
      if (
        normalizeAccountName(existing.accountName) !==
        normalizeAccountName(row.record.account_name)
      ) {
        warnings.push({
          entity: "contacts",
          row: row.source_row,
          warning: "The same contact email references a different company.",
        });
      }
      duplicateSourceRows.contacts.add(row.source_row);
    } else if (normalizedEmail) {
      contactEmails.set(normalizedEmail, {
        row: row.source_row,
        accountName: row.record.account_name,
      });
    }

    if (
      row.record.account_name &&
      !accountNames.has(normalizeAccountName(row.record.account_name))
    ) {
      warnings.push({
        entity: "contacts",
        row: row.source_row,
        warning: `Company "${row.record.account_name}" is not present in accounts.csv; the importer will check the database.`,
      });
    }
  }

  for (const row of entities.implementation_steps?.rows ?? []) {
    if (
      row.record.account_name &&
      !accountNames.has(normalizeAccountName(row.record.account_name))
    ) {
      warnings.push({
        entity: "implementation_steps",
        row: row.source_row,
        warning: `Company "${row.record.account_name}" is not present in accounts.csv; the importer will check the database.`,
      });
    }

    if (
      row.record.status &&
      !IMPLEMENTATION_STATUSES.has(row.record.status.toLowerCase())
    ) {
      errors.push({
        entity: "implementation_steps",
        row: row.source_row,
        error: `Invalid implementation status: ${row.record.status}`,
      });
    }

    if (!isValidDate(row.record.due_date)) {
      errors.push({
        entity: "implementation_steps",
        row: row.source_row,
        error: `Invalid due_date: ${row.record.due_date}`,
      });
    }
  }

  for (const row of entities.cases?.rows ?? []) {
    if (!normalizeEmail(row.record.customer_email)) {
      errors.push({
        entity: "cases",
        row: row.source_row,
        error: "Missing required field: customer_email",
      });
    }

    if (
      row.record.priority &&
      !CASE_PRIORITIES.has(row.record.priority.toUpperCase())
    ) {
      errors.push({
        entity: "cases",
        row: row.source_row,
        error: `Invalid priority: ${row.record.priority}`,
      });
    }

    if (
      row.record.status &&
      !CASE_STATUSES.has(row.record.status.toLowerCase())
    ) {
      errors.push({
        entity: "cases",
        row: row.source_row,
        error: `Invalid case status: ${row.record.status}`,
      });
    }

    if (
      row.record.customer_email &&
      row.record.subject &&
      row.record.message
    ) {
      const identity = stableCaseIdentity(row.record);

      if (caseIdentities.has(identity)) {
        warnings.push({
          entity: "cases",
          row: row.source_row,
          warning: `Duplicate case row; first seen on row ${caseIdentities.get(identity)}.`,
        });
        duplicateSourceRows.cases.add(row.source_row);
      } else {
        caseIdentities.set(identity, row.source_row);
      }
    }
  }

  return { warnings, errors, duplicateSourceRows };
}

module.exports = {
  isValidDate,
  normalizeAccountName,
  normalizeEmail,
  normalizeText,
  stableCaseIdentity,
  validateImportPlan,
};
