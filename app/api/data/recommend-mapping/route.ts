import {
  recommendDatasetMapping,
  type DataSourceMode,
} from "../../../../lib/data-onboarding/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const mode: DataSourceMode =
      url.searchParams.get("mode") === "upload" ? "upload" : "sample";
    const sessionId = url.searchParams.get("session_id");

    return Response.json(
      await recommendDatasetMapping({ mode, sessionId })
    );
  } catch (error) {
    console.error("Mapping recommendation failed", error);
    return Response.json(
      { error: "Unable to recommend a mapping for the selected dataset." },
      { status: 500 }
    );
  }
}
