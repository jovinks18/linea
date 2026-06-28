import { dryRunSampleImport } from "../../../../lib/data-onboarding/service";

export const runtime = "nodejs";

export async function POST() {
  try {
    return Response.json(await dryRunSampleImport());
  } catch (error) {
    console.error("Data import dry-run failed", error);
    return Response.json(
      {
        error:
          "Unable to complete the dry run. Confirm PostgreSQL is running and the schema is current.",
      },
      { status: 500 }
    );
  }
}
