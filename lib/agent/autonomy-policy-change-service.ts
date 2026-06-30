import type { PoolClient } from "pg";
// @ts-expect-error Node's direct TypeScript test runner requires the extension.
import * as policyRepository from "./autonomy-policy.repository.ts";
// @ts-expect-error Node's direct TypeScript test runner requires the extension.
import { createActionAutonomyPolicyChangeRequest } from "./autonomy-policy-change-request.repository.ts";
// @ts-expect-error Node's direct TypeScript test runner requires the extension.
import * as policyValidation from "./autonomy-policy-validation.ts";
import type { ActionAutonomyPolicy } from "./autonomy-policy";
import type {
  ActionAutonomyPolicyChangeRequestRecord,
} from "./autonomy-policy-change-request.repository";

export type SubmitActionAutonomyPolicyChangeResult =
  | {
      mode: "applied";
      policy: ActionAutonomyPolicy;
    }
  | {
      mode: "pending_approval";
      request: ActionAutonomyPolicyChangeRequestRecord;
      risk_reasons: string[];
    };

export async function submitActionAutonomyPolicyChange(
  client: PoolClient,
  input: {
    action_type: string;
    segment: string | null;
    patch: Record<string, unknown>;
    changed_by: string;
    change_reason: string;
  }
): Promise<SubmitActionAutonomyPolicyChangeResult> {
  const existingPolicy =
    await policyRepository.findActionAutonomyPolicyForUpdate(
      client,
      input.action_type,
      input.segment
    );

  if (!existingPolicy) {
    throw new policyRepository.ActionAutonomyPolicyNotFoundError(
      input.action_type,
      input.segment
    );
  }

  const validation = policyValidation.validatePolicyUpdate({
    existingPolicy,
    patch: input.patch,
    changedBy: input.changed_by,
    changeReason: input.change_reason,
  });

  if (!validation.valid) {
    throw new policyRepository.ActionAutonomyPolicyValidationError(
      validation.errors
    );
  }

  const risk = policyValidation.classifyPolicyChangeRisk({
    existingPolicy,
    normalizedPatch: validation.value.patch,
  });

  if (!risk.risky) {
    return {
      mode: "applied",
      policy: await policyRepository.updateActionAutonomyPolicyWithAudit(
        client,
        {
          action_type: input.action_type,
          segment: input.segment,
          patch: validation.value.patch,
          changed_by: validation.value.changedBy,
          change_reason: validation.value.changeReason,
        }
      ),
    };
  }

  const proposedPolicy: ActionAutonomyPolicy = {
    ...existingPolicy,
    ...validation.value.patch,
    updated_by: validation.value.changedBy,
    updated_at: new Date(),
  };
  const request = await createActionAutonomyPolicyChangeRequest(client, {
    action_type: input.action_type,
    segment: input.segment,
    old_policy: existingPolicy,
    proposed_policy: proposedPolicy,
    patch: validation.value.patch,
    requested_by: validation.value.changedBy,
    request_reason: validation.value.changeReason,
  });

  return {
    mode: "pending_approval",
    request,
    risk_reasons: risk.reasons,
  };
}
