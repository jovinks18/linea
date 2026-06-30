export type BlastRadiusScope =
  | "none"
  | "case"
  | "account"
  | "multi_account"
  | "global";

export type ComputedBlastRadius = {
  value: number;
  scope: BlastRadiusScope;
  reason: string;
};

export type BlastRadiusInput = {
  action_type: string;
  case_id?: number | null;
  account_id?: number | null;
  affected_account_ids?: number[];
  affected_customer_ids?: number[];
  is_batch?: boolean;
  is_policy_change?: boolean;
};

const noMutationActions = new Set([
  "require_human_review",
  "detect_onboarding_blocker",
]);

const accountActions = new Set([
  "create_csm_task",
  "log_product_signal",
  "create_account_health_event",
  "update_account_health",
]);

export function computeBlastRadius(
  input: BlastRadiusInput
): ComputedBlastRadius {
  if (input.is_policy_change) {
    return {
      value: 3,
      scope: "global",
      reason: "Changes global policy behavior.",
    };
  }

  const affectedAccounts = new Set(
    (input.affected_account_ids ?? []).filter(Number.isSafeInteger)
  );

  if (input.is_batch && affectedAccounts.size > 1) {
    return {
      value: 2,
      scope: "multi_account",
      reason: "Affects multiple accounts.",
    };
  }

  if (noMutationActions.has(input.action_type)) {
    return {
      value: 0,
      scope: "none",
      reason: "Classifies or routes work without mutating customer records.",
    };
  }

  if (input.action_type === "create_support_case") {
    return {
      value: 1,
      scope: "case",
      reason: "Affects only the current support case.",
    };
  }

  if (accountActions.has(input.action_type)) {
    if (input.account_id !== null && input.account_id !== undefined) {
      return {
        value: 1,
        scope: "account",
        reason: "Affects one linked account.",
      };
    }

    return {
      value: 1,
      scope: "case",
      reason: "No linked account exists; scope is limited to the current case.",
    };
  }

  return {
    value: 1,
    scope: "case",
    reason: "Unknown action defaults to the current support case scope.",
  };
}
