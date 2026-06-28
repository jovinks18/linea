import {
  dryRunDatasetImport,
  type DataSourceMode,
} from "../../../../lib/data-onboarding/service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      mode?: unknown;
      session_id?: unknown;
    };
    const mode: DataSourceMode =
      body.mode === "upload" ? "upload" : "sample";
    const sessionId =
      typeof body.session_id === "string" ? body.session_id : null;

    return Response.json(
      await dryRunDatasetImport({ mode, sessionId })
    );
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
