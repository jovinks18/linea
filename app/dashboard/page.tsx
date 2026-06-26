import { AppShell } from "../../components/AppShell";
import { MetricCard } from "../../components/MetricCard";
import { Panel } from "../../components/Panel";
import { StatusPill } from "../../components/StatusPill";
import { getDashboardData } from "../../lib/dashboard/repository";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function EmptyState({ label }: { label: string }) {
  return (
    <div className="rounded-lg border border-dashed border-white/10 bg-black/20 p-5 text-sm text-zinc-500">
      {label}
    </div>
  );
}

function formatDate(value: string | null) {
  if (!value) return "Not set";

  return new Date(value).toLocaleString();
}

function formatLabel(value: string | null | undefined) {
  if (!value) return "Not set";

  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export default async function DashboardPage() {
  const data = await getDashboardData();
  const openCaseCount = data.recentCases.filter(
    (supportCase) => supportCase.status === "open"
  ).length;

  return (
    <AppShell active="dashboard">
      <div className="grid gap-6">
        <header>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-cyan-300/80">
            Command center
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-zinc-50 sm:text-4xl">
            Post-sales operations console
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-400 sm:text-base">
            Monitor account risk, follow-up work, product signals, and recent
            support activity from the local demo database.
          </p>
        </header>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="At-risk accounts"
            value={data.atRiskAccounts.length}
            detail="health_status = at_risk"
          />
          <MetricCard
            label="Open tasks"
            value={data.openTasks.length}
            detail="CSM follow-ups"
          />
          <MetricCard
            label="Product signals"
            value={data.recentProductSignals.length}
            detail="recent signals"
          />
          <MetricCard
            label="Open cases"
            value={openCaseCount}
            detail="from recent activity"
          />
        </section>

        <div className="grid gap-6 xl:grid-cols-2">
          <Panel eyebrow="Accounts" title="At-risk accounts">
            {data.atRiskAccounts.length === 0 ? (
              <EmptyState label="No at-risk accounts yet." />
            ) : (
              <div className="divide-y divide-white/10 overflow-hidden rounded-lg border border-white/10">
                {data.atRiskAccounts.map((account) => (
                  <div
                    key={account.id}
                    className="grid gap-4 bg-black/25 p-4 sm:grid-cols-[1fr_auto]"
                  >
                    <div>
                      <p className="font-medium text-zinc-100">
                        {account.name}
                      </p>
                      <p className="mt-1 text-sm text-zinc-500">
                        {account.plan ?? "No plan"} /{" "}
                        {account.stage ?? "No stage"}
                      </p>
                      <p className="mt-3 text-sm text-zinc-400">
                        Owner: {account.owner_name ?? "Unassigned"}
                      </p>
                    </div>
                    <div className="sm:text-right">
                      <StatusPill variant="danger">
                        {account.health_status ?? "unknown"}
                      </StatusPill>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel eyebrow="Follow-up" title="Open tasks">
            {data.openTasks.length === 0 ? (
              <EmptyState label="No open tasks yet." />
            ) : (
              <div className="divide-y divide-white/10 overflow-hidden rounded-lg border border-white/10">
                {data.openTasks.map((task) => (
                  <div key={task.id} className="bg-black/25 p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="font-medium text-zinc-100">
                          {task.title}
                        </p>
                        <p className="mt-1 text-sm text-zinc-500">
                          {task.account ?? "No account"}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2 sm:justify-end">
                        <StatusPill variant="default">
                          {formatLabel(task.status)}
                        </StatusPill>
                        <StatusPill
                          variant={task.priority === "P1" ? "danger" : "info"}
                        >
                          {task.priority ?? "P2"}
                        </StatusPill>
                      </div>
                    </div>
                    <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                      <div>
                        <p className="text-zinc-500">Owner</p>
                        <p className="mt-1 text-zinc-200">
                          {task.owner_role ?? "Unassigned"}
                        </p>
                      </div>
                      <div>
                        <p className="text-zinc-500">Due date</p>
                        <p className="mt-1 text-zinc-200">
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
              <EmptyState label="No product signals yet." />
            ) : (
              <div className="divide-y divide-white/10 overflow-hidden rounded-lg border border-white/10">
                {data.recentProductSignals.map((signal) => (
                  <div key={signal.id} className="bg-black/25 p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="font-medium text-zinc-100">
                          {signal.title}
                        </p>
                        <p className="mt-1 text-sm text-zinc-500">
                          {signal.account ?? "No account"}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2 sm:justify-end">
                        <StatusPill
                          variant={
                            signal.severity === "high" ? "warning" : "default"
                          }
                        >
                          {signal.severity ?? "medium"}
                        </StatusPill>
                        <StatusPill variant="muted">
                          {formatLabel(signal.status)}
                        </StatusPill>
                      </div>
                    </div>
                    <p className="mt-4 text-sm text-zinc-400">
                      Type: {formatLabel(signal.signal_type)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel eyebrow="Cases" title="Recent cases">
            {data.recentCases.length === 0 ? (
              <EmptyState label="No recent cases yet." />
            ) : (
              <div className="divide-y divide-white/10 overflow-hidden rounded-lg border border-white/10">
                {data.recentCases.map((supportCase) => (
                  <div key={supportCase.id} className="bg-black/25 p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="font-mono text-sm font-medium text-zinc-100">
                          {supportCase.case_number}
                        </p>
                        <p className="mt-1 text-sm text-zinc-500">
                          {supportCase.customer_email}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2 sm:justify-end">
                        <StatusPill variant="default">
                          {formatLabel(supportCase.status)}
                        </StatusPill>
                        <StatusPill
                          variant={
                            supportCase.priority === "P1" ? "danger" : "info"
                          }
                        >
                          {supportCase.priority ?? "P2"}
                        </StatusPill>
                      </div>
                    </div>
                    <p className="mt-4 text-sm text-zinc-200">
                      {supportCase.subject ?? "No subject"}
                    </p>
                    <p className="mt-3 text-xs text-zinc-500">
                      Last activity: {formatDate(supportCase.last_activity_at)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>
      </div>
    </AppShell>
  );
}
