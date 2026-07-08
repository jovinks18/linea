import { fileURLToPath } from "node:url";
import path from "node:path";
import { Pool } from "pg";
import { getDatabaseConfig } from "../lib/db-config.ts";
import {
  DEFAULT_EVAL_CONFIG,
  loadGoldenCasesFromDirectory,
  runOfflineEval,
} from "../lib/eval/runner.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultGoldenDir = path.resolve(__dirname, "../lib/eval/golden");

function parseArgs(argv) {
  const options = {
    dir: defaultGoldenDir,
    writeScorecard: true,
    json: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--dir") {
      const value = argv[index + 1];
      if (!value) throw new Error("--dir requires a path.");
      options.dir = path.resolve(value);
      index += 1;
      continue;
    }

    if (arg === "--no-write-scorecard") {
      options.writeScorecard = false;
      continue;
    }

    if (arg === "--json") {
      options.json = true;
      continue;
    }

    throw new Error(`Unknown eval argument: ${arg}`);
  }

  return options;
}

function formatPercent(value) {
  return `${(value * 100).toFixed(1)}%`;
}

function printHumanSummary(result, { writeScorecard }) {
  console.log(`Linea offline eval ${result.eval_run_id}`);
  console.log(`Mode: ${result.mode}`);
  console.log(`Samples: ${result.sample_size}`);
  console.log(`Scorecard write: ${writeScorecard ? "enabled" : "disabled"}`);
  console.log("");
  console.log("Priority");
  console.log(`  exact: ${formatPercent(result.priority.exact_match_rate)}`);
  console.log(`  off_by_one: ${formatPercent(result.priority.off_by_one_rate)}`);
  console.log("");
  console.log("Classification");
  for (const metric of result.classification_metrics) {
    console.log(
      `  ${metric.class_name}: precision=${metric.precision.toFixed(3)} recall=${metric.recall.toFixed(3)} f1=${metric.f1.toFixed(3)}`
    );
  }
  console.log("");
  console.log("Actions");
  for (const metric of result.action_metrics) {
    console.log(
      `  ${metric.action_type}: precision=${metric.precision.toFixed(3)} recall=${metric.recall.toFixed(3)} f1=${metric.f1.toFixed(3)} floor=${DEFAULT_EVAL_CONFIG.actionF1Floor.toFixed(2)}`
    );
  }
  console.log("");
  console.log(`Safety unsafe_gate_rate: ${result.unsafe_gate_rate.toFixed(3)}`);

  if (result.failures.length > 0) {
    console.log("");
    console.log("Failures");
    for (const failure of result.failures) {
      console.log(`  - ${failure}`);
    }
  }
}

function formatError(error) {
  if (error instanceof AggregateError) {
    const messages = error.errors
      .map((candidate) =>
        candidate instanceof Error && candidate.message
          ? candidate.message
          : String(candidate)
      )
      .filter(Boolean);

    return messages.length > 0
      ? messages.join("; ")
      : error.message || "Aggregate error";
  }

  return error instanceof Error ? error.message : String(error);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const goldenCases = await loadGoldenCasesFromDirectory(options.dir);
  const pool = new Pool(getDatabaseConfig());
  const client = await pool.connect();

  try {
    const result = await runOfflineEval({
      client,
      goldenCases,
      writeScorecard: options.writeScorecard,
    });

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printHumanSummary(result, options);
    }

    if (!result.passed) {
      process.exitCode = 1;
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(formatError(error));
  process.exitCode = 1;
});
