import { profileSampleData } from "../../../../lib/data-onboarding/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    return Response.json(profileSampleData());
  } catch (error) {
    console.error("Data profile failed", error);
    return Response.json(
      { error: "Unable to profile the sample dataset." },
      { status: 500 }
    );
  }
}
