import Link from "next/link";
import { getDashboardData } from "../../lib/dashboard/repository";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function EmptyState({ label }: { label: string }) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-5 text-sm text-neutral-500">
      {label}
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
      <p className="text-sm text-neutral-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-white">{value}</p>
    </div>
  );
}

function formatDate(value: string | null) {
  if (!value) return "Not set";

  return new Date(value).toLocaleString();
}

export default async function DashboardPage() {
  const data = await getDashboardData();

  return (
    <main className="min-h-screen bg-neutral-950 px-6 py-10 text-white">
      <div className="mx-auto w-full max-w-7xl">
        <header className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm text-neutral-400">Linea Demo</p>
            <h1 className="mt-1 text-3xl font-semibold">
              Post-Sales Command Center
            </h1>
            <p className="mt-2 max-w-2xl text-neutral-400">
              Review account risk, follow-up tasks, product signals, and recent
              support cases.
            </p>
          </div>

          <Link
            href="/chat"
            className="w-fit rounded-lg border border-neutral-700 px-4 py-2 text-sm text-neutral-200 hover:border-neutral-500"
          >
            Back to Chat
          </Link>
        </header>

        <section className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryCard
            label="At-risk accounts"
            value={data.atRiskAccounts.length}
          />
          <SummaryCard label="Open tasks" value={data.openTasks.length} />
          <SummaryCard
            label="Product signals"
            value={data.recentProductSignals.length}
          />
          <SummaryCard
            label="Open cases"
            value={
              data.recentCases.filter((supportCase) => supportCase.status === "open")
                .length
            }
          />
        </section>

        <div className="grid gap-6 xl:grid-cols-2">
          <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-6 shadow-xl">
            <div className="mb-5">
              <p className="text-sm text-neutral-400">Accounts</p>
              <h2 className="mt-1 text-2xl font-semibold">At-Risk Accounts</h2>
            </div>

            {data.atRiskAccounts.length === 0 ? (
              <EmptyState label="No at-risk accounts yet." />
            ) : (
              <div className="space-y-3">
                {data.atRiskAccounts.map((account) => (
                  <div
                    key={account.id}
                    className="rounded-xl border border-neutral-800 bg-neutral-950 p-4"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-medium">{account.name}</p>
                        <p className="mt-1 text-sm text-neutral-500">
                          {account.plan ?? "No plan"} /{" "}
                          {account.stage ?? "No stage"}
                        </p>
                      </div>
                      <span className="rounded-full border border-red-800 bg-red-950 px-3 py-1 text-xs text-red-200">
                        {account.health_status ?? "unknown"}
                      </span>
                    </div>
                    <p className="mt-3 text-sm text-neutral-400">
                      Owner: {account.owner_name ?? "Unassigned"}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-6 shadow-xl">
            <div className="mb-5">
              <p className="text-sm text-neutral-400">Follow-Up</p>
              <h2 className="mt-1 text-2xl font-semibold">Open Tasks</h2>
            </div>

            {data.openTasks.length === 0 ? (
              <EmptyState label="No open tasks yet." />
            ) : (
              <div className="space-y-3">
                {data.openTasks.map((task) => (
                  <div
                    key={task.id}
                    className="rounded-xl border border-neutral-800 bg-neutral-950 p-4"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-medium">{task.title}</p>
                        <p className="mt-1 text-sm text-neutral-500">
                          {task.account ?? "No account"}
                        </p>
                      </div>
                      <span className="rounded-full border border-neutral-700 bg-neutral-900 px-3 py-1 text-xs text-neutral-300">
                        {task.priority ?? "P2"}
                      </span>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-neutral-500">Status</p>
                        <p>{task.status ?? "Not set"}</p>
                      </div>
                      <div>
                        <p className="text-neutral-500">Owner</p>
                        <p>{task.owner_role ?? "Unassigned"}</p>
                      </div>
                      <div className="col-span-2">
                        <p className="text-neutral-500">Due</p>
                        <p>{task.due_date ?? "Not set"}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-6 shadow-xl">
            <div className="mb-5">
              <p className="text-sm text-neutral-400">Product</p>
              <h2 className="mt-1 text-2xl font-semibold">
                Recent Product Signals
              </h2>
            </div>

            {data.recentProductSignals.length === 0 ? (
              <EmptyState label="No product signals yet." />
            ) : (
              <div className="space-y-3">
                {data.recentProductSignals.map((signal) => (
                  <div
                    key={signal.id}
                    className="rounded-xl border border-neutral-800 bg-neutral-950 p-4"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-medium">{signal.title}</p>
                        <p className="mt-1 text-sm text-neutral-500">
                          {signal.account ?? "No account"}
                        </p>
                      </div>
                      <span className="rounded-full border border-neutral-700 bg-neutral-900 px-3 py-1 text-xs text-neutral-300">
                        {signal.severity ?? "medium"}
                      </span>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-neutral-500">Type</p>
                        <p>{signal.signal_type}</p>
                      </div>
                      <div>
                        <p className="text-neutral-500">Status</p>
                        <p>{signal.status ?? "new"}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-6 shadow-xl">
            <div className="mb-5">
              <p className="text-sm text-neutral-400">Cases</p>
              <h2 className="mt-1 text-2xl font-semibold">Recent Cases</h2>
            </div>

            {data.recentCases.length === 0 ? (
              <EmptyState label="No recent cases yet." />
            ) : (
              <div className="space-y-3">
                {data.recentCases.map((supportCase) => (
                  <div
                    key={supportCase.id}
                    className="rounded-xl border border-neutral-800 bg-neutral-950 p-4"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-medium">
                          {supportCase.case_number}
                        </p>
                        <p className="mt-1 text-sm text-neutral-500">
                          {supportCase.customer_email}
                        </p>
                      </div>
                      <span className="rounded-full border border-neutral-700 bg-neutral-900 px-3 py-1 text-xs text-neutral-300">
                        {supportCase.status ?? "open"}
                      </span>
                    </div>
                    <p className="mt-3 text-sm text-neutral-200">
                      {supportCase.subject ?? "No subject"}
                    </p>
                    <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-neutral-500">Priority</p>
                        <p>{supportCase.priority ?? "P2"}</p>
                      </div>
                      <div>
                        <p className="text-neutral-500">Last activity</p>
                        <p>{formatDate(supportCase.last_activity_at)}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
