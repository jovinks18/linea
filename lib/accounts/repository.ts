import type { PoolClient } from "pg";

export type PostSalesAccount = {
  id: number;
  name: string;
  industry: string | null;
  plan: string | null;
  stage: string | null;
  health_status: string | null;
  owner_name: string | null;
  metadata: Record<string, unknown>;
};

export async function findCustomerAccount(
  client: PoolClient,
  customerId: number
): Promise<PostSalesAccount | null> {
  const result = await client.query<PostSalesAccount>(
    `SELECT
      a.id,
      a.name,
      a.industry,
      a.plan,
      a.stage,
      a.health_status,
      a.owner_name,
      a.metadata
    FROM account_contacts ac
    JOIN accounts a ON a.id = ac.account_id
    WHERE ac.customer_id = $1
    ORDER BY ac.is_primary DESC, ac.created_at ASC
    LIMIT 1`,
    [customerId]
  );

  return result.rows[0] ?? null;
}

export async function updateAccountHealthStatus({
  client,
  accountId,
  healthStatus,
}: {
  client: PoolClient;
  accountId: number;
  healthStatus: string;
}) {
  return client.query(
    `UPDATE accounts
     SET health_status = $1, updated_at = NOW()
     WHERE id = $2`,
    [healthStatus, accountId]
  );
}
