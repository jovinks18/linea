"use client";

import { AppShell } from "../../components/AppShell";
import { Panel } from "../../components/Panel";

export default function DashboardError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <AppShell active="dashboard">
      <Panel eyebrow="Command center" title="Could not load dashboard data">
        <div className="grid gap-4">
          <p className="text-sm leading-6 text-[var(--text-muted)]">
            The command center could not read the local demo database. Check
            that Postgres is running and seeded, then retry.
          </p>
          <button
            type="button"
            onClick={reset}
            className="w-fit rounded-lg border border-[var(--border-strong)] px-3 py-2 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--surface-2)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
          >
            Retry
          </button>
        </div>
      </Panel>
    </AppShell>
  );
}
