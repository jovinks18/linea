import { AppShell } from "../../components/AppShell";
import { PageBody, PageHeader } from "../../components/PageHeader";
import { Panel } from "../../components/Panel";

export default function DashboardLoading() {
  return (
    <AppShell active="dashboard">
      <PageBody>
        <PageHeader
          title="Command center"
          description="Fetching account risk, tasks, product signals, and cases."
        />
        <Panel title="Loading command center">
          <p className="text-sm text-[var(--text-muted)]">
            Linea is reading the local Postgres demo data.
          </p>
        </Panel>
      </PageBody>
    </AppShell>
  );
}
