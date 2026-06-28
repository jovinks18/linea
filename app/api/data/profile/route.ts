import {
  profileSampleData,
  profileUploadedData,
} from "../../../../lib/data-onboarding/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const mode = url.searchParams.get("mode");
    const sessionId = url.searchParams.get("session_id");

    return Response.json(
      mode === "upload" && sessionId
        ? profileUploadedData(sessionId)
        : profileSampleData()
    );
  } catch (error) {
    console.error("Data profile failed", error);
    return Response.json(
      { error: "Unable to profile the selected dataset." },
      { status: 400 }
    );
  }
}
