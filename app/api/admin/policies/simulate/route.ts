import type { PoolClient } from "pg";
import {
  ActionAutonomyPolicyNotFoundError,
  ActionAutonomyPolicyValidationError,
} from "../../../../../lib/agent/autonomy-policy.repository";
import { simulatePolicyPatchImpact } from "../../../../../lib/agent/autonomy-policy-simulation";
import {
  getCurrentOperator,
  operatorUnauthorizedResponse,
} from "../../../../../lib/auth/current-operator";
import { pool } from "../../../../../lib/db";

export const runtime = "nodejs";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function POST(request: Request) {
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

  const actionType =
    typeof body.action_type === "string" ? body.action_type.trim() : "";
  const segment =
    body.segment === null || typeof body.segment === "string"
      ? body.segment
      : undefined;
  const errors: string[] = [];

  if (!actionType) errors.push("Action type is required.");
  if (segment === undefined) {
    errors.push("Segment must be a string or null.");
  }
  if (!isRecord(body.patch)) {
    errors.push("Patch must be a JSON object.");
  }

  if (errors.length > 0 || segment === undefined) {
    return Response.json({ errors }, { status: 400 });
  }

  let client: PoolClient | null = null;

  try {
    client = await pool.connect();
    const result = await simulatePolicyPatchImpact(client, {
      action_type: actionType,
      segment,
      patch: body.patch as Record<string, unknown>,
    });

    return Response.json(result);
  } catch (error) {
    if (error instanceof ActionAutonomyPolicyValidationError) {
      return Response.json({ errors: error.errors }, { status: 400 });
    }

    if (error instanceof ActionAutonomyPolicyNotFoundError) {
      return Response.json({ errors: [error.message] }, { status: 404 });
    }

    console.error(
      "Autonomy policy simulation failed:",
      error instanceof Error ? error.message : "Unknown error"
    );
    return Response.json(
      { errors: ["Autonomy policy simulation failed unexpectedly."] },
      { status: 500 }
    );
  } finally {
    client?.release();
  }
}
