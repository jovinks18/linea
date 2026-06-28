import assert from "node:assert/strict";
import { runPostSalesAutomation } from "../lib/post-sales/repository.ts";

function createDirective(actionType, execute, overrides = {}) {
  return {
    action_type: actionType,
    execute,
    status: execute ? "executed" : "suggested",
    tier: execute ? "bounded" : "supervised",
    confidence_floor: 0.8,
    max_blast_radius: 1,
    requires_reversible: actionType !== "update_account_health",
    ...overrides,
  };
}

function createFakeClient() {
  const queries = [];

  return {
    queries,
    async query(sql, values) {
      queries.push({ sql, values });
      return { rowCount: 1, rows: [] };
    },
  };
}

function createAccount() {
  return {
    id: 10,
    name: "Acme Clinics",
    industry: "Healthcare",
    plan: "Growth",
    stage: "implementation",
    health_status: "healthy",
    owner_name: "Jordan Lee",
    metadata: {},
  };
}

const blockerMessage =
  "Our API setup is still blocked and we are supposed to go live Friday.";
const executableDirectives = [
  createDirective("detect_onboarding_blocker", true),
  createDirective("create_csm_task", true),
  createDirective("log_product_signal", true),
  createDirective("create_account_health_event", true),
  createDirective("update_account_health", true, {
    requires_reversible: false,
  }),
];

{
  const client = createFakeClient();
  const account = createAccount();
  const actions = await runPostSalesAutomation({
    client,
    account,
    supportCaseId: 101,
    customerMessageId: 201,
    message: blockerMessage,
    actionDirectives: executableDirectives,
  });

  assert.deepEqual(actions, {
    onboarding_blocker_detected: true,
    task_created: true,
    product_signal_created: true,
    health_event_created: true,
    account_health_updated: true,
  });
  assert.equal(client.queries.length, 4);
  assert.equal(account.health_status, "at_risk");
}

{
  const client = createFakeClient();
  const account = createAccount();
  const actions = await runPostSalesAutomation({
    client,
    account,
    supportCaseId: 102,
    customerMessageId: 202,
    message: blockerMessage,
    actionDirectives: [
      createDirective("detect_onboarding_blocker", true),
      createDirective("update_account_health", false),
    ],
  });

  assert.equal(actions.onboarding_blocker_detected, true);
  assert.equal(actions.account_health_updated, false);
  assert.equal(client.queries.length, 0);
  assert.equal(account.health_status, "healthy");
}

{
  const client = createFakeClient();
  const account = createAccount();
  const actions = await runPostSalesAutomation({
    client,
    account,
    supportCaseId: 103,
    customerMessageId: 203,
    message: blockerMessage,
    actionDirectives: [],
  });

  assert.deepEqual(actions, {
    onboarding_blocker_detected: false,
    task_created: false,
    product_signal_created: false,
    health_event_created: false,
    account_health_updated: false,
  });
  assert.equal(client.queries.length, 0);
  assert.equal(account.health_status, "healthy");
}

{
  const client = createFakeClient();
  const actions = await runPostSalesAutomation({
    client,
    account: null,
    supportCaseId: 104,
    customerMessageId: 204,
    message: blockerMessage,
    actionDirectives: executableDirectives,
  });

  assert.equal(actions.onboarding_blocker_detected, true);
  assert.equal(actions.task_created, false);
  assert.equal(actions.product_signal_created, false);
  assert.equal(actions.health_event_created, false);
  assert.equal(actions.account_health_updated, false);
  assert.equal(client.queries.length, 0);
}

console.log("PASS post-sales directive enforcement");
