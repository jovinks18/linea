import type { PoolClient } from "pg";
import { ActionAutonomyPolicyChangeRequestDataError } from "../../../../../../lib/agent/autonomy-policy-change-request.repository";
import {
  ActionAutonomyPolicySimulationDataError,
  simulatePolicyChangeRequestImpact,
} from "../../../../../../lib/agent/autonomy-policy-simulation";
import { pool } from "../../../../../../lib/db";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!/^\d+$/.test(id)) {
    return Response.json(
      { errors: ["Change request id must be numeric."] },
      { status: 400 }
    );
  }

  let client: PoolClient | null = null;

  try {
    client = await pool.connect();
    const result = await simulatePolicyChangeRequestImpact(client, {
      requestId: id,
    });

    if (!result) {
      return Response.json(
        { errors: [`Autonomy policy change request ${id} was not found.`] },
        { status: 404 }
      );
    }

    return Response.json(result);
  } catch (error) {
    if (
      error instanceof ActionAutonomyPolicySimulationDataError ||
      error instanceof ActionAutonomyPolicyChangeRequestDataError
    ) {
      return Response.json({ errors: [error.message] }, { status: 400 });
    }

    console.error(
      "Policy change request impact simulation failed:",
      error instanceof Error ? error.message : "Unknown error"
    );
    return Response.json(
      {
        errors: [
          "Policy change request impact simulation failed unexpectedly.",
        ],
      },
      { status: 500 }
    );
  } finally {
    client?.release();
  }
}
