import assert from "node:assert/strict";
import { runBasicTriage } from "../lib/triage/engine.ts";

const scenarios = [
  {
    name: "known account API blocker",
    message:
      "Our API setup is still blocked and we are supposed to go live Friday.",
    expectedSubject: "Implementation Blocker - API go-live",
  },
  {
    name: "unknown account API blocker",
    message:
      "Our API setup is still blocked and we are supposed to go live Friday.",
    expectedSubject: "Implementation Blocker - API go-live",
  },
  {
    name: "smart lock failure",
    message: "My smart lock is not responding after I changed the batteries.",
    expectedSubject: "Smart lock support issue",
  },
];

for (const scenario of scenarios) {
  const triage = runBasicTriage(scenario.message);

  assert.equal(
    triage.subject,
    scenario.expectedSubject,
    `${scenario.name} should create a distinct case subject`
  );
}

console.log("PASS triage subject regression");
