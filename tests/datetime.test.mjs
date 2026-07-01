import assert from "node:assert/strict";
import { formatOperatorDateTime } from "../lib/ui/datetime.ts";

const expected = "2026-07-01 07:46 UTC";

assert.equal(
  formatOperatorDateTime("2026-07-01 07:46:10.123456"),
  expected
);
assert.equal(
  formatOperatorDateTime("2026-07-01T07:46:10.123Z"),
  expected
);
assert.equal(
  formatOperatorDateTime("2026-07-01T00:46:10.123-07:00"),
  expected
);
assert.equal(
  formatOperatorDateTime(new Date("2026-07-01T07:46:10.123Z")),
  expected
);
assert.equal(formatOperatorDateTime(null), "Not set");
assert.equal(formatOperatorDateTime("not-a-date"), "Invalid date");

console.log("PASS deterministic operator datetime formatting");
