import { recommendSampleMapping } from "../../../../lib/data-onboarding/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    return Response.json(await recommendSampleMapping());
  } catch (error) {
    console.error("Mapping recommendation failed", error);
    return Response.json(
      { error: "Unable to recommend a mapping for the sample dataset." },
      { status: 500 }
    );
  }
}
