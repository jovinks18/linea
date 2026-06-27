import { pool } from "../db";

export type DashboardAccount = {
  id: number;
  name: string;
  plan: string | null;
  stage: string | null;
  health_status: string | null;
  owner_name: string | null;
  metadata: Record<string, unknown>;
};

export type DashboardTask = {
  id: number;
  title: string;
  account: string | null;
  status: string | null;
  priority: string | null;
  owner_role: string | null;
  due_date: string | null;
};

export type DashboardProductSignal = {
  id: number;
  title: string;
  signal_type: string;
  severity: string | null;
  status: string | null;
  account: string | null;
};

export type DashboardCase = {
  id: number;
  case_number: string;
  subject: string | null;
  priority: string | null;
  status: string | null;
  account: string | null;
  customer_email: string;
  last_activity_at: string | null;
};

export type DashboardAgentAction = {
  id: string;
  case_number: string | null;
  account_name: string | null;
  action_type: string;
  status: string;
  source: string;
  confidence: string | null;
  reasoning_summary: string | null;
  metadata: Record<string, unknown>;
  executed_at: string | null;
  created_at: string;
};

export type DashboardData = {
  agentActions: DashboardAgentAction[];
  importedAccounts: DashboardAccount[];
  atRiskAccounts: DashboardAccount[];
  openTasks: DashboardTask[];
  recentProductSignals: DashboardProductSignal[];
  recentCases: DashboardCase[];
};

export async function getDashboardData(): Promise<DashboardData> {
  const [
    agentActionsResult,
    importedAccountsResult,
    atRiskAccountsResult,
    openTasksResult,
    recentProductSignalsResult,
    recentCasesResult,
  ] = await Promise.all([
    pool.query<DashboardAgentAction>(
      `SELECT
        aa.id::text AS id,
        c.case_number,
        a.name AS account_name,
        aa.action_type,
        aa.status,
        aa.source,
        aa.confidence::text AS confidence,
        aa.reasoning_summary,
        aa.metadata,
        aa.executed_at::text AS executed_at,
        aa.created_at::text AS created_at
       FROM agent_actions aa
       LEFT JOIN cases c ON c.id = aa.case_id
       LEFT JOIN accounts a ON a.id = aa.account_id
       ORDER BY aa.created_at DESC, aa.id DESC
       LIMIT 20`
    ),
    pool.query<DashboardAccount>(
      `SELECT id, name, plan, stage, health_status, owner_name, metadata
       FROM accounts
       WHERE metadata <> '{}'::jsonb
         AND health_status IS DISTINCT FROM 'at_risk'
       ORDER BY updated_at DESC, name ASC
       LIMIT 10`
    ),
    pool.query<DashboardAccount>(
      `SELECT id, name, plan, stage, health_status, owner_name, metadata
       FROM accounts
       WHERE health_status = 'at_risk'
       ORDER BY updated_at DESC, name ASC
       LIMIT 10`
    ),
    pool.query<DashboardTask>(
      `SELECT
        t.id,
        t.title,
        a.name AS account,
        t.status,
        t.priority,
        t.owner_role,
        t.due_date::text AS due_date
       FROM tasks t
       LEFT JOIN accounts a ON a.id = t.account_id
       WHERE t.status = 'open'
       ORDER BY t.due_date ASC NULLS LAST, t.updated_at DESC
       LIMIT 10`
    ),
    pool.query<DashboardProductSignal>(
      `SELECT
        ps.id,
        ps.title,
        ps.signal_type,
        ps.severity,
        ps.status,
        a.name AS account
       FROM product_signals ps
       LEFT JOIN accounts a ON a.id = ps.account_id
       ORDER BY ps.updated_at DESC, ps.created_at DESC
       LIMIT 10`
    ),
    pool.query<DashboardCase>(
      `SELECT
        c.id,
        c.case_number,
        c.subject,
        c.priority,
        c.status,
        a.name AS account,
        cu.email AS customer_email,
        c.last_activity_at::text AS last_activity_at
       FROM cases c
       JOIN customers cu ON cu.id = c.customer_id
       LEFT JOIN account_contacts ac ON ac.customer_id = cu.id
       LEFT JOIN accounts a ON a.id = ac.account_id
       ORDER BY c.last_activity_at DESC
       LIMIT 10`
    ),
  ]);

  return {
    agentActions: agentActionsResult.rows,
    importedAccounts: importedAccountsResult.rows,
    atRiskAccounts: atRiskAccountsResult.rows,
    openTasks: openTasksResult.rows,
    recentProductSignals: recentProductSignalsResult.rows,
    recentCases: recentCasesResult.rows,
  };
}
