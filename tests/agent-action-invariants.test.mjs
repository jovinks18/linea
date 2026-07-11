import assert from "node:assert/strict";
import { Pool } from "pg";
import { getDatabaseConfig } from "../lib/db-config.ts";

const pool = new Pool(getDatabaseConfig());
const client = await pool.connect();

try {
  const result = await client.query(
    `SELECT
      id,
      action_type,
      status,
      metadata->>'reason' AS reason
     FROM agent_actions
     WHERE action_type = 'require_human_review'
       AND metadata->>'reason' IN ('out_of_bounds', 'guard_failed')
     ORDER BY id`
  );

  assert.deepEqual(result.rows, []);
} finally {
  client.release();
  await pool.end();
}

console.log("PASS agent action invariants");
