import {
  importDataset,
  type DataSourceMode,
} from "../../../../lib/data-onboarding/service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      confirm?: unknown;
      mode?: unknown;
      session_id?: unknown;
    };

    if (
      body.confirm !== true ||
      (body.mode !== "sample" && body.mode !== "upload")
    ) {
      return Response.json(
        { error: "A confirmed data import is required." },
        { status: 400 }
      );
    }

    const mode = body.mode as DataSourceMode;
    const sessionId =
      typeof body.session_id === "string" ? body.session_id : null;

    return Response.json(await importDataset({ mode, sessionId }));
  } catch (error) {
    console.error("Data import failed", error);
    return Response.json(
      {
        error:
          "Unable to import the selected dataset. Confirm PostgreSQL is running and the schema is current.",
      },
      { status: 500 }
    );
  }
}
