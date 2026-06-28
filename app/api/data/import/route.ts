import { importSampleData } from "../../../../lib/data-onboarding/service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      confirm?: unknown;
      mode?: unknown;
    };

    if (body.confirm !== true || body.mode !== "sample") {
      return Response.json(
        { error: "A confirmed sample import is required." },
        { status: 400 }
      );
    }

    return Response.json(await importSampleData());
  } catch (error) {
    console.error("Sample data import failed", error);
    return Response.json(
      {
        error:
          "Unable to import the sample dataset. Confirm PostgreSQL is running and the schema is current.",
      },
      { status: 500 }
    );
  }
}
