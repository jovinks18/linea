import assert from "node:assert/strict";
import { computeBlastRadius } from "../lib/agent/blast-radius.ts";

assert.deepEqual(
  computeBlastRadius({ action_type: "require_human_review" }),
  {
    value: 0,
    scope: "none",
    reason: "Classifies or routes work without mutating customer records.",
  }
);

assert.deepEqual(
  computeBlastRadius({ action_type: "detect_onboarding_blocker" }),
  {
    value: 0,
    scope: "none",
    reason: "Classifies or routes work without mutating customer records.",
  }
);

assert.deepEqual(
  computeBlastRadius({
    action_type: "create_support_case",
    case_id: 10,
  }),
  {
    value: 1,
    scope: "case",
    reason: "Affects only the current support case.",
  }
);

assert.deepEqual(
  computeBlastRadius({
    action_type: "create_csm_task",
    account_id: 20,
  }),
  {
    value: 1,
    scope: "account",
    reason: "Affects one linked account.",
  }
);

assert.deepEqual(
  computeBlastRadius({
    action_type: "log_product_signal",
    is_batch: true,
    affected_account_ids: [20, 21, 21],
  }),
  {
    value: 2,
    scope: "multi_account",
    reason: "Affects multiple accounts.",
  }
);

assert.deepEqual(
  computeBlastRadius({
    action_type: "update_account_health",
    is_policy_change: true,
  }),
  {
    value: 3,
    scope: "global",
    reason: "Changes global policy behavior.",
  }
);

assert.deepEqual(
  computeBlastRadius({ action_type: "unknown_action" }),
  {
    value: 1,
    scope: "case",
    reason: "Unknown action defaults to the current support case scope.",
  }
);

console.log("PASS computed blast radius");
