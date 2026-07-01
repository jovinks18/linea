import type { PoolClient } from "pg";
// @ts-expect-error Node's direct TypeScript test runner requires the extension.
import { insertAgentAction } from "../agent/repository.ts";

export type CaseReviewResult = {
  case_number: string;
  requires_human_review: boolean;
  review_status: "flagged";
  already_flagged: boolean;
};

export async function flagCaseForHumanReview(
  client: PoolClient,
  {
    caseNumber,
    operatorUsername,
  }: {
    caseNumber: string;
    operatorUsername: string;
  }
): Promise<CaseReviewResult | null> {
  const caseResult = await client.query<{
    id: number;
    case_number: string;
    requires_human_review: boolean;
    account_id: number | null;
  }>(
    `SELECT
      c.id,
      c.case_number,
      c.requires_human_review,
      linked_account.account_id
     FROM cases c
     LEFT JOIN LATERAL (
       SELECT ac.account_id
       FROM account_contacts ac
       WHERE ac.customer_id = c.customer_id
       ORDER BY ac.is_primary DESC, ac.created_at ASC
       LIMIT 1
     ) linked_account ON TRUE
     WHERE c.case_number = $1
     FOR UPDATE OF c`,
    [caseNumber]
  );
  const supportCase = caseResult.rows[0];

  if (!supportCase) return null;

  if (!supportCase.requires_human_review) {
    await client.query(
      `UPDATE cases
       SET
         requires_human_review = TRUE,
         review_status = 'flagged',
         metadata = jsonb_set(
           metadata,
           '{agent_decision}',
           COALESCE(metadata->'agent_decision', '{}'::jsonb) ||
             '{"requires_human_review": true}'::jsonb,
           TRUE
         ),
         updated_at = NOW()
       WHERE id = $1`,
      [supportCase.id]
    );

    await insertAgentAction(client, {
      case_id: supportCase.id,
      account_id: supportCase.account_id,
      action_type: "flag_human_review",
      status: "executed",
      source: "operator",
      confidence: null,
      reasoning_summary: "Operator flagged this case for human review.",
      metadata: {
        reason: "Operator requested review",
        actor: operatorUsername,
        operator: operatorUsername,
      },
      executed_at: new Date(),
    });
  }

  return {
    case_number: supportCase.case_number,
    requires_human_review: true,
    review_status: "flagged",
    already_flagged: supportCase.requires_human_review,
  };
}
