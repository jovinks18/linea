import type { PoolClient } from "pg";
import {
  ActionAutonomyPolicyChangeRequestDriftError,
  ActionAutonomyPolicyChangeRequestNotFoundError,
  ActionAutonomyPolicyChangeRequestStateError,
  ActionAutonomyPolicyChangeRequestValidationError,
  approveActionAutonomyPolicyChangeRequest,
} from "../../../../../../lib/agent/autonomy-policy-change-request.repository";
import {
  getCurrentOperator,
  operatorUnauthorizedResponse,
} from "../../../../../../lib/auth/current-operator";
import { pool } from "../../../../../../lib/db";

export const runtime = "nodejs";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const operator = await getCurrentOperator();
  if (!operator) return operatorUnauthorizedResponse();

  const { id } = await params;

  if (!/^\d+$/.test(id)) {
    return Response.json(
      { errors: ["Change request id must be numeric."] },
      { status: 400 }
    );
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return Response.json(
      { errors: ["Request body must be valid JSON."] },
      { status: 400 }
    );
  }

  if (!isRecord(body)) {
    return Response.json(
      { errors: ["Request body must be a JSON object."] },
      { status: 400 }
    );
  }

  let client: PoolClient | null = null;
  let transactionStarted = false;

  try {
    client = await pool.connect();
    await client.query("BEGIN");
    transactionStarted = true;

    const result = await approveActionAutonomyPolicyChangeRequest(client, {
      id,
      reviewed_by: operator.username,
      review_reason:
        typeof body.review_reason === "string" ? body.review_reason : "",
    });

    await client.query("COMMIT");
    transactionStarted = false;

    return Response.json(result);
  } catch (error) {
    if (client && transactionStarted) {
      await client.query("ROLLBACK").catch((rollbackError) => {
        console.error(
          "Policy approval rollback failed:",
          rollbackError instanceof Error
            ? rollbackError.message
            : "Unknown rollback error"
        );
      });
    }

    if (error instanceof ActionAutonomyPolicyChangeRequestValidationError) {
      return Response.json({ errors: error.errors }, { status: 400 });
    }

    if (error instanceof ActionAutonomyPolicyChangeRequestNotFoundError) {
      return Response.json({ errors: [error.message] }, { status: 404 });
    }

    if (
      error instanceof ActionAutonomyPolicyChangeRequestStateError ||
      error instanceof ActionAutonomyPolicyChangeRequestDriftError
    ) {
      return Response.json({ errors: [error.message] }, { status: 409 });
    }

    console.error(
      "Policy change approval failed:",
      error instanceof Error ? error.message : "Unknown error"
    );
    return Response.json(
      { errors: ["Policy change approval failed unexpectedly."] },
      { status: 500 }
    );
  } finally {
    client?.release();
  }
}
