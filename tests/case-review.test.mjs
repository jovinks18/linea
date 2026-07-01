import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { flagCaseForHumanReview } from "../lib/cases/review-repository.ts";

const auditRows = [];
const fakeClient = {
  async query(sql, values) {
    if (sql.includes("FOR UPDATE OF c")) {
      return {
        rows: [
          {
            id: 42,
            case_number: "LIN-SYNTHETIC-REVIEW",
            requires_human_review: false,
            account_id: 7,
          },
        ],
      };
    }

    if (sql.includes("UPDATE cases")) {
      return { rowCount: 1, rows: [] };
    }

    if (sql.includes("INSERT INTO agent_actions")) {
      auditRows.push({
        source: values[4],
        metadata: JSON.parse(values[7]),
      });
      return { rows: [{ id: "1" }] };
    }

    throw new Error(`Unexpected query: ${sql}`);
  },
};

const result = await flagCaseForHumanReview(fakeClient, {
  caseNumber: "LIN-SYNTHETIC-REVIEW",
  operatorUsername: "verified.operator",
});

assert.deepEqual(result, {
  case_number: "LIN-SYNTHETIC-REVIEW",
  requires_human_review: true,
  review_status: "flagged",
  already_flagged: false,
});
assert.deepEqual(auditRows, [
  {
    source: "operator",
    metadata: {
      reason: "Operator requested review",
      actor: "verified.operator",
      operator: "verified.operator",
    },
  },
]);

const routeSource = readFileSync(
  new URL(
    "../app/api/cases/[case_number]/flag-review/route.ts",
    import.meta.url
  ),
  "utf8"
);
assert.match(routeSource, /getCurrentOperator/);
assert.match(routeSource, /operatorUnauthorizedResponse/);
assert.match(routeSource, /operatorUsername: operator\.username/);
assert.ok(
  routeSource.indexOf("getCurrentOperator") <
    routeSource.indexOf("pool.connect")
);
assert.doesNotMatch(routeSource, /request\.json|body\.(actor|operator)/);

console.log("PASS authenticated case review and operator attribution");
