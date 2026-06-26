import { AppShell } from "../../components/AppShell";
import { MetricCard } from "../../components/MetricCard";
import { Panel } from "../../components/Panel";

export default function DashboardLoading() {
  return (
    <AppShell active="dashboard">
      <div className="grid gap-6">
        <header>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--text-subtle)]">
            Command center
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-[var(--text-primary)] sm:text-4xl">
            Loading operations console
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--text-muted)] sm:text-base">
            Fetching account risk, tasks, product signals, and cases.
          </p>
        </header>
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="At-risk accounts" value="-" detail="Loading" />
          <MetricCard label="Open tasks" value="-" detail="Loading" />
          <MetricCard label="Product signals" value="-" detail="Loading" />
          <MetricCard label="Open cases" value="-" detail="Loading" />
        </section>
        <Panel title="Loading command center">
          <p className="text-sm text-[var(--text-muted)]">
            Linea is reading the local Postgres demo data.
          </p>
        </Panel>
      </div>
    </AppShell>
  );
}
