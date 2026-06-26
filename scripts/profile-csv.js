/* eslint-disable @typescript-eslint/no-require-imports */
const path = require("node:path");
const { getArgument, profileCsvDirectory } = require("./csv-tools");

function main() {
  const directory = path.resolve(
    getArgument("--dir", "docs/import-templates")
  );
  const profiles = profileCsvDirectory(directory);

  console.log(JSON.stringify(profiles, null, 2));
}

try {
  main();
} catch (error) {
  console.error(
    "Unable to profile CSV files:",
    error instanceof Error ? error.message : error
  );
  process.exitCode = 1;
}
