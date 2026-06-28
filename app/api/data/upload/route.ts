import {
  storeUploadedDataset,
  type UploadEntity,
} from "../../../../lib/data-onboarding/service";

export const runtime = "nodejs";

const uploadEntities: UploadEntity[] = [
  "accounts",
  "contacts",
  "implementation_steps",
  "cases",
];

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const sessionId = formData.get("session_id");

    if (typeof sessionId !== "string") {
      return Response.json(
        { error: "An upload session is required." },
        { status: 400 }
      );
    }

    const files: Partial<Record<UploadEntity, File>> = {};
    for (const entity of uploadEntities) {
      const value = formData.get(entity);
      if (value instanceof File && value.size > 0) {
        files[entity] = value;
      }
    }

    return Response.json(
      await storeUploadedDataset({ sessionId, files })
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to store the uploaded CSV files.",
      },
      { status: 400 }
    );
  }
}
