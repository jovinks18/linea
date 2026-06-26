/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("node:fs");
const path = require("node:path");

const ENTITY_DEFINITIONS = {
  accounts: {
    required: ["name"],
    aliases: {
      name: ["company_name", "account_name", "company", "account", "name"],
      industry: ["industry", "vertical"],
      plan: ["plan", "subscription_plan", "tier"],
      stage: ["lifecycle_stage", "stage", "account_stage"],
      health_status: ["health_status", "health", "account_health"],
      owner_name: ["owner_name", "account_owner", "csm_name", "csm"],
      go_live_date: ["go_live_date", "launch_date"],
    },
  },
  contacts: {
    required: ["email", "account_name"],
    aliases: {
      email: ["email", "customer_email", "contact_email"],
      name: ["name", "contact_name", "customer_name"],
      contact_role: ["role", "contact_role", "title"],
      account_name: ["company_name", "account_name", "company", "account"],
    },
  },
  implementation_steps: {
    required: ["account_name", "step_name"],
    aliases: {
      account_name: ["company_name", "account_name", "company", "account"],
      step_name: ["step_name", "step", "milestone", "task_name"],
      status: ["status", "step_status"],
      due_date: ["due_date", "target_date"],
      owner_role: ["owner_name", "owner_role", "assignee"],
    },
  },
  cases: {
    required: ["customer_email", "subject", "message"],
    aliases: {
      customer_email: ["customer_email", "email", "contact_email"],
      subject: ["subject", "title", "case_subject"],
      status: ["status", "case_status"],
      priority: ["priority", "severity"],
      channel: ["channel", "source", "channel_origin"],
      message: ["message", "description", "body", "first_message"],
    },
  },
};

function normalizeColumn(value) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }

  if (quoted) {
    throw new Error("CSV contains an unterminated quoted field.");
  }

  const nonEmptyRows = rows.filter((values) =>
    values.some((value) => value.trim() !== "")
  );
  if (nonEmptyRows.length === 0) return { columns: [], rows: [] };

  const columns = nonEmptyRows[0].map((column, index) =>
    index === 0 ? column.replace(/^\uFEFF/, "").trim() : column.trim()
  );
  const uniqueColumns = new Set(columns);

  if (columns.some((column) => !column)) {
    throw new Error("CSV contains an empty header.");
  }
  if (uniqueColumns.size !== columns.length) {
    throw new Error("CSV contains duplicate headers.");
  }

  const records = nonEmptyRows.slice(1).map((values) => {
    if (values.length !== columns.length) {
      throw new Error(
        `CSV row has ${values.length} fields; expected ${columns.length}.`
      );
    }

    return Object.fromEntries(
      columns.map((column, index) => [column, values[index]?.trim() ?? ""])
    );
  });

  return { columns, rows: records };
}

function readCsvFile(filePath) {
  return parseCsv(fs.readFileSync(filePath, "utf8"));
}

function scoreEntity(columns, entity) {
  const definition = ENTITY_DEFINITIONS[entity];
  const normalizedColumns = new Set(columns.map(normalizeColumn));
  let score = 0;

  for (const aliases of Object.values(definition.aliases)) {
    if (aliases.some((alias) => normalizedColumns.has(normalizeColumn(alias)))) {
      score += 1;
    }
  }

  return score;
}

function inferEntityType(fileName, columns) {
  const normalizedFileName = normalizeColumn(path.basename(fileName, ".csv"));

  if (ENTITY_DEFINITIONS[normalizedFileName]) return normalizedFileName;
  if (normalizedFileName.includes("contact")) return "contacts";
  if (normalizedFileName.includes("implementation")) return "implementation_steps";
  if (normalizedFileName.includes("case") || normalizedFileName.includes("ticket")) {
    return "cases";
  }
  if (normalizedFileName.includes("account") || normalizedFileName.includes("company")) {
    return "accounts";
  }

  const ranked = Object.keys(ENTITY_DEFINITIONS)
    .map((entity) => ({ entity, score: scoreEntity(columns, entity) }))
    .sort((left, right) => right.score - left.score);

  return ranked[0]?.score > 0 ? ranked[0].entity : "unknown";
}

function findCanonicalField(entity, column) {
  const definition = ENTITY_DEFINITIONS[entity];
  if (!definition) return null;

  const normalizedColumn = normalizeColumn(column);

  for (const [canonicalField, aliases] of Object.entries(definition.aliases)) {
    if (aliases.some((alias) => normalizeColumn(alias) === normalizedColumn)) {
      return canonicalField;
    }
  }

  return null;
}

function requiredFieldWarnings(entity, columns) {
  const definition = ENTITY_DEFINITIONS[entity];
  if (!definition) return ["Unable to infer an entity type."];

  const mappedFields = new Set(
    columns.map((column) => findCanonicalField(entity, column)).filter(Boolean)
  );

  return definition.required
    .filter((field) => !mappedFields.has(field))
    .map((field) => `Missing required canonical field: ${field}`);
}

function profileCsvDirectory(directory) {
  const files = fs
    .readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".csv"))
    .map((entry) => entry.name)
    .sort();

  return files.map((file) => {
    const parsed = readCsvFile(path.join(directory, file));
    const entityGuess = inferEntityType(file, parsed.columns);

    return {
      file,
      entity_guess: entityGuess,
      columns: parsed.columns,
      row_count: parsed.rows.length,
      sample_rows: parsed.rows.slice(0, 3),
      required_field_warnings: requiredFieldWarnings(
        entityGuess,
        parsed.columns
      ),
    };
  });
}

function getArgument(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1] ?? fallback;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function loadLocalEnvironment() {
  if (typeof process.loadEnvFile !== "function") return;

  for (const file of [".env.local", ".env"]) {
    if (!fs.existsSync(file)) continue;

    try {
      process.loadEnvFile(file);
    } catch {
      // Environment files are optional for profiling and dry runs.
    }
  }
}

module.exports = {
  ENTITY_DEFINITIONS,
  findCanonicalField,
  getArgument,
  hasFlag,
  loadLocalEnvironment,
  normalizeColumn,
  parseCsv,
  profileCsvDirectory,
  readCsvFile,
  requiredFieldWarnings,
};
