import Link from "next/link";
import { AccountMetadata } from "../../components/AccountMetadata";
import { AppShell } from "../../components/AppShell";
import { PageBody, PageHeader } from "../../components/PageHeader";
import { Panel } from "../../components/Panel";
import { StatusPill } from "../../components/StatusPill";
import { getDashboardData } from "../../lib/dashboard/repository";
import {
  healthVariant,
  priorityVariant,
  severityVariant,
} from "../../lib/ui/status";
import { formatOperatorDateTime } from "../../lib/ui/datetime";
import { formatDisplayLabel } from "../../lib/ui/labels";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function EmptyState({ label }: { label: string }) {
  return (
    <div className="rounded-lg border border-dashed border-[var(--border-subtle)] bg-[var(--surface-2)] p-5 text-sm text-[var(--text-muted)]">
      {label}
    </div>
  );
}

type DashboardSearchParams = {
  account?: string;
  priority?: string;
  show?: string;
  sort?: string;
  status?: string;
};

function priorityRank(priority: string | null) {
  if (priority === "P0") return 0;
  if (priority === "P1") return 1;
  if (priority === "P2") return 2;
  if (priority === "P3") return 3;

  return 4;
}

function buildCaseQuery(
  params: DashboardSearchParams,
  updates: DashboardSearchParams
) {
  const nextParams = new URLSearchParams();
  const merged = { ...params, ...updates };

  for (const [key, value] of Object.entries(merged)) {
    if (value && value !== "all") {
      nextParams.set(key, value);
    }
  }

  const query = nextParams.toString();

  return query ? `/dashboard?${query}` : "/dashboard";
}

function FilterLink({
  active,
  children,
  href,
}: {
  active: boolean;
  children: React.ReactNode;
  href: string;
}) {
  return (
    <Link
      href={href}
      className={`rounded-lg border px-3 py-2 text-sm transition focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40 ${
        active
          ? "border-[var(--border-strong)] bg-[var(--surface-3)] text-[var(--text-primary)]"
          : "border-[var(--border-subtle)] text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)]"
      }`}
    >
      {children}
    </Link>
  );
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: Promise<DashboardSearchParams>;
}) {
  const data = await getDashboardData();
  const params = (await searchParams) ?? {};
  const accountOptions = Array.from(
    new Set(data.recentCases.map((supportCase) => supportCase.account).filter(Boolean))
  ) as string[];
  const filteredCases = data.recentCases
    .filter((supportCase) => {
      const priorityMatches =
        !params.priority ||
        params.priority === "all" ||
        supportCase.priority === params.priority;
      const statusMatches =
        !params.status ||
        params.status === "all" ||
        supportCase.status === params.status;
      const accountMatches =
        !params.account ||
        params.account === "all" ||
        supportCase.account === params.account;

      return priorityMatches && statusMatches && accountMatches;
    })
    .sort((caseA, caseB) => {
      if (params.sort === "priority") {
        return priorityRank(caseA.priority) - priorityRank(caseB.priority);
      }

      if (params.sort === "account") {
        return (caseA.account ?? "").localeCompare(caseB.account ?? "");
      }

      if (params.sort === "status") {
        return (caseA.status ?? "").localeCompare(caseB.status ?? "");
      }

      return (
        new Date(caseB.last_activity_at ?? 0).getTime() -
        new Date(caseA.last_activity_at ?? 0).getTime()
      );
    });
  const visibleCases =
    params.show === "all" ? filteredCases : filteredCases.slice(0, 5);

  return (
    <AppShell active="dashboard">
      <PageBody>
        <PageHeader
          title="Command center"
          description="Review what needs human attention, then scan account risk, work, signals, and cases."
        />

        <Panel
          eyebrow="Supervision"
          title="Human Review"
          action={
            data.reviewCases.length > 0 ? (
              <StatusPill variant="danger">
                {data.reviewCases.length} waiting
              </StatusPill>
            ) : undefined
          }
        >
          {data.reviewCases.length === 0 ? (
            <EmptyState label="No cases require human review." />
          ) : (
            <div className="divide-y divide-[var(--border-subtle)] overflow-hidden rounded-lg border border-[var(--border-subtle)]">
              {data.reviewCases.map((supportCase) => (
                <Link
                  key={supportCase.id}
                  href={`/cases/${supportCase.case_number}`}
                  className="grid gap-3 bg-[var(--surface-2)] p-4 transition hover:bg-[var(--surface-3)] focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[var(--accent)]/40 sm:grid-cols-[1fr_auto] sm:items-center"
                >
                  <div>
                    <p className="font-mono text-sm font-medium text-[var(--text-primary)]">
                      {supportCase.case_number}
                    </p>
                    <p className="mt-1 text-sm text-[var(--text-secondary)]">
                      {supportCase.subject ?? "No subject"}
                    </p>
                    <p className="mt-1 text-xs text-[var(--text-muted)]">
                      {supportCase.account ?? supportCase.customer_email}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 sm:justify-end">
                    <StatusPill
                      variant={priorityVariant(supportCase.priority)}
                    >
                      {supportCase.priority ?? "P2"}
                    </StatusPill>
                    <StatusPill variant="danger">
                      {formatDisplayLabel(supportCase.review_status)}
                    </StatusPill>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Panel>

        {data.importedAccounts.length > 0 && (
          <Panel
            eyebrow="Imported data"
            title="Account context"
            action={
              <Link
                href="/data"
                className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-2)] px-3 py-2 text-xs font-medium text-[var(--text-secondary)] transition hover:border-[var(--border-strong)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
              >
                Manage data
              </Link>
            }
          >
            <div className="divide-y divide-[var(--border-subtle)] overflow-hidden rounded-lg border border-[var(--border-subtle)]">
              {data.importedAccounts.map((account) => (
                <div
                  key={account.id}
                  className="grid gap-4 bg-[var(--surface-2)] p-4 sm:grid-cols-[1fr_auto]"
                >
                  <div>
                    <p className="font-medium text-[var(--text-primary)]">
                      {account.name}
                    </p>
                    <p className="mt-1 text-sm text-[var(--text-muted)]">
                      {account.plan ?? "No plan"} /{" "}
                      {formatDisplayLabel(account.stage)}
                    </p>
                    <p className="mt-3 text-sm text-[var(--text-secondary)]">
                      Owner: {account.owner_name ?? "Unassigned"}
                    </p>
                  </div>
                  <div className="sm:text-right">
                    <StatusPill variant={healthVariant(account.health_status)}>
                      {formatDisplayLabel(account.health_status)}
                    </StatusPill>
                  </div>
                  <div className="sm:col-span-2">
                    <AccountMetadata metadata={account.metadata} />
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        )}

        <div className="grid items-start gap-5 xl:grid-cols-2">
          <Panel eyebrow="Accounts" title="At-risk accounts">
            {data.atRiskAccounts.length === 0 ? (
              <EmptyState label="No at-risk accounts - all accounts are currently stable." />
            ) : (
              <div className="divide-y divide-white/10 overflow-hidden rounded-lg border border-white/10">
                {data.atRiskAccounts.map((account) => (
                  <div
                    key={account.id}
                    className="grid gap-4 bg-[var(--surface-2)] p-4 sm:grid-cols-[1fr_auto]"
                  >
                    <div>
                      <p className="font-medium text-[var(--text-primary)]">
                        {account.name}
                      </p>
                      <p className="mt-1 text-sm text-[var(--text-muted)]">
                        {account.plan ?? "No plan"} /{" "}
                        {formatDisplayLabel(account.stage)}
                      </p>
                      <p className="mt-3 text-sm text-[var(--text-secondary)]">
                        Owner: {account.owner_name ?? "Unassigned"}
                      </p>
                    </div>
                    <div className="sm:text-right">
                      <StatusPill variant={healthVariant(account.health_status)}>
                        {formatDisplayLabel(account.health_status)}
                      </StatusPill>
                    </div>
                    <div className="sm:col-span-2">
                      <AccountMetadata metadata={account.metadata} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel eyebrow="Follow-up" title="Open tasks">
            {data.openTasks.length === 0 ? (
              <EmptyState label="No open tasks - no CSM follow-up is waiting." />
            ) : (
              <div className="divide-y divide-white/10 overflow-hidden rounded-lg border border-white/10">
                {data.openTasks.map((task) => (
                  <div key={task.id} className="bg-[var(--surface-2)] p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="font-medium text-[var(--text-primary)]">
                          {task.title}
                        </p>
                        <p className="mt-1 text-sm text-[var(--text-muted)]">
                          {task.account ?? "No account"}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2 sm:justify-end">
                        <StatusPill variant="default">
                          {formatDisplayLabel(task.status)}
                        </StatusPill>
                        <StatusPill
                          variant={priorityVariant(task.priority)}
                        >
                          {task.priority ?? "P2"}
                        </StatusPill>
                      </div>
                    </div>
                    <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                      <div>
                        <p className="text-[var(--text-subtle)]">Owner</p>
                        <p className="mt-1 text-[var(--text-secondary)]">
                          {task.owner_role ?? "Unassigned"}
                        </p>
                      </div>
                      <div>
                        <p className="text-[var(--text-subtle)]">Due date</p>
                        <p className="mt-1 text-[var(--text-secondary)]">
                          {task.due_date ?? "Not set"}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel eyebrow="Product" title="Recent product signals">
            {data.recentProductSignals.length === 0 ? (
              <EmptyState label="No product signals - nothing has been logged for Product Ops." />
            ) : (
              <div className="divide-y divide-white/10 overflow-hidden rounded-lg border border-white/10">
                {data.recentProductSignals.map((signal) => (
                  <div key={signal.id} className="bg-[var(--surface-2)] p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="font-medium text-[var(--text-primary)]">
                          {signal.title}
                        </p>
                        <p className="mt-1 text-sm text-[var(--text-muted)]">
                          {signal.account ?? "No account"}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2 sm:justify-end">
                        <StatusPill
                          variant={severityVariant(signal.severity)}
                        >
                          {formatDisplayLabel(signal.severity)}
                        </StatusPill>
                        <StatusPill variant="muted">
                          {formatDisplayLabel(signal.status)}
                        </StatusPill>
                      </div>
                    </div>
                    <p className="mt-4 text-sm text-[var(--text-secondary)]">
                      Type: {formatDisplayLabel(signal.signal_type)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel eyebrow="Cases" title="Recent cases">
            <div className="mb-5 grid gap-3">
              <div className="flex flex-wrap gap-2">
                {["all", "P1", "P2", "P3"].map((priority) => (
                  <FilterLink
                    key={priority}
                    active={(params.priority ?? "all") === priority}
                    href={buildCaseQuery(params, { priority })}
                  >
                    {priority === "all" ? "All priorities" : priority}
                  </FilterLink>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                {["all", "open", "closed"].map((status) => (
                  <FilterLink
                    key={status}
                    active={(params.status ?? "all") === status}
                    href={buildCaseQuery(params, { status })}
                  >
                    {status === "all"
                      ? "All statuses"
                      : formatDisplayLabel(status)}
                  </FilterLink>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                {["recency", "priority", "status", "account"].map((sort) => (
                  <FilterLink
                    key={sort}
                    active={(params.sort ?? "recency") === sort}
                    href={buildCaseQuery(params, { sort })}
                  >
                    Sort: {formatDisplayLabel(sort)}
                  </FilterLink>
                ))}
              </div>
              {accountOptions.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  <FilterLink
                    active={!params.account || params.account === "all"}
                    href={buildCaseQuery(params, { account: "all" })}
                  >
                    All accounts
                  </FilterLink>
                  {accountOptions.map((account) => (
                    <FilterLink
                      key={account}
                      active={params.account === account}
                      href={buildCaseQuery(params, { account })}
                    >
                      {account}
                    </FilterLink>
                  ))}
                </div>
              )}
            </div>

            {filteredCases.length === 0 ? (
              <EmptyState label="No recent cases match the current filters." />
            ) : (
              <div className="divide-y divide-white/10 overflow-hidden rounded-lg border border-white/10">
                {visibleCases.map((supportCase) => (
                  <Link
                    key={supportCase.id}
                    href={`/cases/${supportCase.case_number}`}
                    className="block bg-[var(--surface-2)] p-4 transition hover:bg-[var(--surface-3)] focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[var(--accent)]/40"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="font-mono text-sm font-medium text-[var(--text-primary)]">
                          {supportCase.case_number}
                        </p>
                        <p className="mt-1 text-sm text-[var(--text-muted)]">
                          {supportCase.account ?? supportCase.customer_email}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2 sm:justify-end">
                        <StatusPill variant="default">
                          {formatDisplayLabel(supportCase.status)}
                        </StatusPill>
                        <StatusPill
                          variant={priorityVariant(supportCase.priority)}
                        >
                          {supportCase.priority ?? "P2"}
                        </StatusPill>
                      </div>
                    </div>
                    <p className="mt-4 text-sm text-[var(--text-secondary)]">
                      {supportCase.subject ?? "No subject"}
                    </p>
                    <p className="mt-3 text-xs text-[var(--text-subtle)]">
                      Last activity:{" "}
                      {formatOperatorDateTime(supportCase.last_activity_at)}
                    </p>
                  </Link>
                ))}
              </div>
            )}
            {filteredCases.length > 5 && params.show !== "all" && (
              <div className="mt-4">
                <Link
                  href={buildCaseQuery(params, { show: "all" })}
                  className="text-sm font-medium text-[var(--text-primary)] underline decoration-[var(--border-strong)] underline-offset-4 hover:decoration-[var(--accent)]"
                >
                  View all {filteredCases.length} cases
                </Link>
              </div>
            )}
          </Panel>
        </div>
      </PageBody>
    </AppShell>
  );
}
