import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { getDatabaseConfig } from "../lib/db-config.ts";
import { runAutonomyGates } from "../lib/agent/autonomy-gate-runner.ts";

function parseArgs(argv) {
  const options = {
    json: false,
    gateRunId: `gate-${randomUUID()}`,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--json") {
      options.json = true;
      continue;
    }

    if (arg === "--gate-run-id") {
      const value = argv[index + 1];
      if (!value) throw new Error("--gate-run-id requires a value.");
      options.gateRunId = value;
      index += 1;
      continue;
    }

    throw new Error(`Unknown gates argument: ${arg}`);
  }

  return options;
}

function formatSegment(segment) {
  return segment ?? "default";
}

function printSummary(summary) {
  console.log(`Linea autonomy gates ${summary.gate_run_id}`);
  console.log(`Evaluated: ${summary.evaluated}`);
  console.log(`Promotion requests: ${summary.promoted_requests}`);
  console.log(`Automatic demotions: ${summary.demotions}`);
  console.log(`Holds: ${summary.holds}`);
  console.log("");

  for (const item of summary.items) {
    const request = item.request_id ? ` request=${item.request_id}` : "";
    const evalRun = item.eval_run_id ? ` eval=${item.eval_run_id}` : "";
    console.log(
      `${item.action_type}/${formatSegment(item.segment)} ${item.current_tier}->${item.target_tier} ${item.direction} reason=${item.reason}${evalRun}${request}`
    );
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const pool = new Pool(getDatabaseConfig());
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const summary = await runAutonomyGates({
      client,
      gateRunId: options.gateRunId,
    });
    await client.query("COMMIT");

    if (options.json) {
      console.log(JSON.stringify(summary, null, 2));
    } else {
      printSummary(summary);
    }
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
