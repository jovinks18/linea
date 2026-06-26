/* eslint-disable @typescript-eslint/no-require-imports */
const path = require("node:path");
const {
  findCanonicalField,
  getArgument,
  loadLocalEnvironment,
  normalizeColumn,
  profileCsvDirectory,
} = require("./csv-tools");

function buildDeterministicMapping(profiles) {
  const entities = {};
  const reviewNotes = [];

  for (const profile of profiles) {
    if (profile.entity_guess === "unknown") {
      reviewNotes.push(`${profile.file}: entity type could not be inferred.`);
      continue;
    }

    const fields = {};
    const metadata = {};
    let mappedColumnCount = 0;

    for (const column of profile.columns) {
      const canonicalField = findCanonicalField(profile.entity_guess, column);

      if (canonicalField) {
        fields[column] = canonicalField;
        mappedColumnCount += 1;
      } else {
        metadata[column] = normalizeColumn(column);
        reviewNotes.push(
          `${profile.file}: review custom metadata mapping for "${column}".`
        );
      }
    }

    entities[profile.entity_guess] = {
      file: profile.file,
      fields,
      metadata,
      confidence:
        profile.columns.length === 0
          ? 0
          : Number((mappedColumnCount / profile.columns.length).toFixed(2)),
      needs_review: profile.required_field_warnings,
    };
  }

  return {
    version: 1,
    generated_by: "deterministic",
    entities,
    confidence:
      profiles.length === 0
        ? 0
        : Number(
            (
              Object.values(entities).reduce(
                (total, entity) => total + entity.confidence,
                0
              ) / profiles.length
            ).toFixed(2)
          ),
    needs_review: reviewNotes,
  };
}

function validateModelReview(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const suggestions = Array.isArray(value.suggestions)
    ? value.suggestions
        .filter(
          (suggestion) =>
            suggestion &&
            typeof suggestion === "object" &&
            typeof suggestion.file === "string" &&
            typeof suggestion.column === "string" &&
            typeof suggestion.recommended_field === "string" &&
            typeof suggestion.reason === "string"
        )
        .map((suggestion) => ({
          file: suggestion.file,
          column: suggestion.column,
          recommended_field: suggestion.recommended_field,
          reason: suggestion.reason,
          confidence:
            typeof suggestion.confidence === "number" &&
            Number.isFinite(suggestion.confidence)
              ? Math.max(0, Math.min(1, suggestion.confidence))
              : null,
        }))
    : [];

  const notes = Array.isArray(value.notes)
    ? value.notes.filter((note) => typeof note === "string")
    : [];

  return { suggestions, notes };
}

async function getModelReview(profiles, deterministicMapping) {
  loadLocalEnvironment();
  if (!process.env.MODEL_PROVIDER || process.env.MODEL_PROVIDER === "deterministic") {
    return null;
  }

  const { callConfiguredModel } = await import("../lib/models/provider.ts");
  const payload = await callConfiguredModel([
    {
      role: "system",
      content:
        "You review CSV-to-Linea mapping suggestions. Return JSON only with suggestions and notes. Suggestions are review-only and must never claim to import data, execute SQL, or mutate a database.",
    },
    {
      role: "user",
      content: JSON.stringify({
        canonical_entities: [
          "accounts",
          "contacts",
          "implementation_steps",
          "cases",
        ],
        profiles,
        deterministic_mapping: deterministicMapping,
        required_shape: {
          suggestions: [
            {
              file: "string",
              column: "external column",
              recommended_field: "canonical field or metadata key",
              reason: "short explanation",
              confidence: "number from 0 to 1",
            },
          ],
          notes: ["review note"],
        },
      }),
    },
  ]);

  return validateModelReview(payload);
}

async function main() {
  const directory = path.resolve(
    getArgument("--dir", "docs/import-templates")
  );
  const profiles = profileCsvDirectory(directory);
  const recommendation = buildDeterministicMapping(profiles);
  const modelReview = await getModelReview(profiles, recommendation);

  if (modelReview) {
    recommendation.generated_by = "deterministic_with_model_review";
    recommendation.model_review = modelReview;
    recommendation.needs_review.push(
      "Model suggestions are review-only and are not applied automatically."
    );
  }

  console.log(JSON.stringify(recommendation, null, 2));
}

main().catch((error) => {
  console.error(
    "Unable to recommend CSV mappings:",
    error instanceof Error ? error.message : error
  );
  process.exitCode = 1;
});
