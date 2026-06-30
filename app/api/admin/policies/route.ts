import type { PoolClient } from "pg";
import {
  ActionAutonomyPolicyNotFoundError,
  ActionAutonomyPolicyValidationError,
} from "../../../../lib/agent/autonomy-policy.repository";
import { submitActionAutonomyPolicyChange } from "../../../../lib/agent/autonomy-policy-change-service";
import {
  getCurrentOperator,
  operatorUnauthorizedResponse,
} from "../../../../lib/auth/current-operator";
import { pool } from "../../../../lib/db";

export const runtime = "nodejs";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function PATCH(request: Request) {
  const operator = await getCurrentOperator();
  if (!operator) return operatorUnauthorizedResponse();

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

  const requestErrors: string[] = [];
  const actionType =
    typeof body.action_type === "string" ? body.action_type.trim() : "";
  const segment =
    body.segment === null || typeof body.segment === "string"
      ? body.segment
      : undefined;

  if (!actionType) {
    requestErrors.push("Action type is required.");
  }

  if (segment === undefined) {
    requestErrors.push("Segment must be a string or null.");
  }

  if (!isRecord(body.patch)) {
    requestErrors.push("Patch must be a JSON object.");
  }

  if (requestErrors.length > 0 || segment === undefined) {
    return Response.json({ errors: requestErrors }, { status: 400 });
  }

  let client: PoolClient | null = null;
  let transactionStarted = false;

  try {
    client = await pool.connect();
    await client.query("BEGIN");
    transactionStarted = true;

    const result = await submitActionAutonomyPolicyChange(client, {
      action_type: actionType,
      segment,
      patch: body.patch as Record<string, unknown>,
      changed_by: operator.username,
      change_reason:
        typeof body.change_reason === "string" ? body.change_reason : "",
    });

    await client.query("COMMIT");
    transactionStarted = false;

    return Response.json(result);
  } catch (error) {
    if (client && transactionStarted) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error(
          "Autonomy policy rollback failed:",
          rollbackError instanceof Error
            ? rollbackError.message
            : "Unknown rollback error"
        );
      }
    }

    if (error instanceof ActionAutonomyPolicyValidationError) {
      return Response.json({ errors: error.errors }, { status: 400 });
    }

    if (error instanceof ActionAutonomyPolicyNotFoundError) {
      return Response.json({ errors: [error.message] }, { status: 404 });
    }

    console.error(
      "Autonomy policy update failed:",
      error instanceof Error ? error.message : "Unknown error"
    );

    return Response.json(
      { errors: ["Autonomy policy update failed unexpectedly."] },
      { status: 500 }
    );
  } finally {
    client?.release();
  }
}
