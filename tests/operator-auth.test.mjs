import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  authenticateOperatorCredentials,
  createOperatorSessionToken,
  getOperatorAuthConfig,
  verifyOperatorSessionToken,
} from "../lib/auth/operator-session.ts";

const config = {
  username: "synthetic.operator",
  password: "synthetic-password-123",
  sessionSecret: "synthetic-session-secret-that-is-long-enough",
};
const now = new Date("2026-06-30T12:00:00.000Z");

assert.equal(
  authenticateOperatorCredentials(
    {
      username: "synthetic.operator",
      password: "synthetic-password-123",
    },
    config
  ),
  true
);
assert.equal(
  authenticateOperatorCredentials(
    {
      username: "forged.operator",
      password: "synthetic-password-123",
    },
    config
  ),
  false
);
assert.equal(
  authenticateOperatorCredentials(
    {
      username: "synthetic.operator",
      password: "wrong-password",
    },
    config
  ),
  false
);

const token = createOperatorSessionToken({
  username: config.username,
  sessionSecret: config.sessionSecret,
  now,
  sessionId: "synthetic-session-id",
});
const session = verifyOperatorSessionToken({
  token,
  sessionSecret: config.sessionSecret,
  now: new Date("2026-06-30T13:00:00.000Z"),
});

assert.deepEqual(session, {
  username: "synthetic.operator",
  role: "policy_admin",
  session_id: "synthetic-session-id",
  issued_at: 1782820800,
  expires_at: 1782849600,
});

const [payload, signature] = token.split(".");
const tamperedSignature = `${signature.slice(0, -1)}${
  signature.endsWith("a") ? "b" : "a"
}`;
assert.equal(
  verifyOperatorSessionToken({
    token: `${payload}.${tamperedSignature}`,
    sessionSecret: config.sessionSecret,
    now,
  }),
  null
);
assert.equal(
  verifyOperatorSessionToken({
    token,
    sessionSecret: "different-synthetic-session-secret-value",
    now,
  }),
  null
);
assert.equal(
  verifyOperatorSessionToken({
    token,
    sessionSecret: config.sessionSecret,
    now: new Date("2026-06-30T20:00:01.000Z"),
  }),
  null
);

assert.equal(
  getOperatorAuthConfig({
    LINEA_ADMIN_USERNAME: "synthetic.operator",
    LINEA_ADMIN_PASSWORD: "too-short",
    LINEA_SESSION_SECRET: "synthetic-session-secret-that-is-long-enough",
  }),
  null
);
assert.equal(
  getOperatorAuthConfig({
    LINEA_ADMIN_USERNAME: "synthetic.operator",
    LINEA_ADMIN_PASSWORD: "synthetic-password-123",
    LINEA_SESSION_SECRET: "short",
  }),
  null
);

const mutationRoutes = [
  "app/api/admin/policies/route.ts",
  "app/api/admin/policy-change-requests/[id]/approve/route.ts",
  "app/api/admin/policy-change-requests/[id]/reject/route.ts",
  "app/api/cases/[case_number]/flag-review/route.ts",
];

for (const route of mutationRoutes) {
  const source = readFileSync(new URL(`../${route}`, import.meta.url), "utf8");
  assert.match(source, /getCurrentOperator/);
  assert.doesNotMatch(source, /body\.(changed_by|reviewed_by)/);
}

const policyRoute = readFileSync(
  new URL("../app/api/admin/policies/route.ts", import.meta.url),
  "utf8"
);
assert.match(policyRoute, /changed_by: operator\.username/);

for (const route of mutationRoutes.slice(1, 3)) {
  const source = readFileSync(new URL(`../${route}`, import.meta.url), "utf8");
  assert.match(source, /reviewed_by: operator\.username/);
}

console.log("PASS authenticated operator sessions and audit attribution");
