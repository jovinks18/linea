import { NextResponse } from "next/server";
import { getCaseDetail } from "../../../../lib/cases/detail-repository";

export const runtime = "nodejs";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ case_number: string }> }
) {
  const { case_number } = await params;

  if (!case_number) {
    return NextResponse.json(
      { error: "case_number is required" },
      { status: 400 }
    );
  }

  try {
    const detail = await getCaseDetail(case_number);

    if (!detail) {
      return NextResponse.json(
        { error: "Case not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(detail);
  } catch (error) {
    console.error("Linea case fetch error:", error);

    return NextResponse.json(
      { error: "Failed to fetch case" },
      { status: 500 }
    );
  }
}
