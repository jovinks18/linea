import { NextResponse } from "next/server";
import {
  getCurrentOperator,
  operatorUnauthorizedResponse,
} from "../../../../../lib/auth/current-operator";
import { flagCaseForHumanReview } from "../../../../../lib/cases/review-repository";
import { pool } from "../../../../../lib/db";

export const runtime = "nodejs";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ case_number: string }> }
) {
  const operator = await getCurrentOperator();
  if (!operator) return operatorUnauthorizedResponse();

  const { case_number: caseNumber } = await params;

  if (!caseNumber) {
    return NextResponse.json(
      { error: "caseNumber is required" },
      { status: 400 }
    );
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const result = await flagCaseForHumanReview(client, {
      caseNumber,
      operatorUsername: operator.username,
    });

    if (!result) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Case not found" }, { status: 404 });
    }

    await client.query("COMMIT");
    return NextResponse.json(result);
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Linea case review error:", error);
    return NextResponse.json(
      { error: "Failed to flag case for human review" },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
