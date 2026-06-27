import assert from "node:assert/strict";
import importUtils from "../scripts/import-utils.js";

const {
  isValidDate,
  stableCaseIdentity,
  validateImportPlan,
} = importUtils;

function row(sourceRow, record, metadata = {}) {
  return { source_row: sourceRow, record, metadata };
}

const firstIdentity = stableCaseIdentity({
  customer_email: "DEVON.REED@example.com ",
  subject: " API credential   blocker ",
  channel: "Email",
  message: " Setup is blocked. ",
});
const repeatedIdentity = stableCaseIdentity({
  customer_email: "devon.reed@example.com",
  subject: "api credential blocker",
  channel: "email",
  message: "setup is blocked.",
});

assert.equal(firstIdentity, repeatedIdentity);
assert.equal(isValidDate("2026-02-28"), true);
assert.equal(isValidDate("2026-02-30"), false);
assert.equal(isValidDate("06/27/2026"), false);

const validation = validateImportPlan({
  accounts: {
    rows: [
      row(2, { name: "Harbor Health Systems" }),
      row(3, { name: " harbor  health systems " }),
    ],
  },
  contacts: {
    rows: [
      row(2, {
        email: "devon.reed@example.com",
        account_name: "Missing Company",
      }),
      row(3, {
        email: "DEVON.REED@example.com",
        account_name: "Another Company",
      }),
    ],
  },
  implementation_steps: {
    rows: [
      row(2, {
        account_name: "Missing Company",
        step_name: "Connect API",
        status: "blocked",
        due_date: "2026-02-30",
      }),
    ],
  },
  cases: {
    rows: [
      row(2, {
        customer_email: "devon.reed@example.com",
        subject: "API blocker",
        status: "open",
        priority: "P1",
        channel: "email",
        message: "Setup is blocked.",
      }),
      row(3, {
        customer_email: "DEVON.REED@example.com",
        subject: " api blocker ",
        status: "open",
        priority: "P1",
        channel: "EMAIL",
        message: " setup is blocked. ",
      }),
      row(4, {
        customer_email: "",
        subject: "Invalid case",
        status: "mystery",
        priority: "urgent",
        channel: "email",
        message: "Needs review.",
      }),
    ],
  },
});

assert.equal(validation.duplicateSourceRows.accounts.has(3), true);
assert.equal(validation.duplicateSourceRows.contacts.has(3), true);
assert.equal(validation.duplicateSourceRows.cases.has(3), true);
assert.ok(
  validation.warnings.some(({ warning }) =>
    warning.includes("not present in accounts.csv")
  )
);
assert.ok(
  validation.warnings.some(({ warning }) =>
    warning.includes("different company")
  )
);
assert.ok(
  validation.errors.some(({ error }) => error.includes("Invalid due_date"))
);
assert.ok(
  validation.errors.some(({ error }) => error.includes("Invalid priority"))
);
assert.ok(
  validation.errors.some(({ error }) => error.includes("Invalid case status"))
);
assert.ok(
  validation.errors.some(({ error }) =>
    error.includes("Missing required field: customer_email")
  )
);

console.log("PASS CSV import identity and validation");
