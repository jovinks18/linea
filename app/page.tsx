import Link from "next/link";
import { AppShell } from "../components/AppShell";
import { Panel } from "../components/Panel";
import { WorkflowLog } from "../components/WorkflowLog";

const features = [
  {
    title: "Intake",
    body: "Capture customer messages and create structured cases.",
  },
  {
    title: "Agent Decisions",
    body: "Classify risk, recommend actions, and explain decisions safely.",
  },
  {
    title: "Command Center",
    body: "Track account health, open tasks, product signals, and recent cases.",
  },
  {
    title: "Data Onboarding",
    body: "Profile, map, validate, and import customer context safely.",
  },
];

const workflow = [
  { label: "Message", detail: "Customer signal enters the workspace." },
  { label: "Triage", detail: "Intent, sentiment, and priority are assigned." },
  { label: "Account Context", detail: "Known contacts map to accounts." },
  { label: "Agent Decision", detail: "Linea explains what it understood." },
  { label: "Actions", detail: "Tasks, signals, and health events execute." },
  { label: "Dashboard", detail: "Operators review the live command center." },
];

export default function Home() {
  return (
    <AppShell active="home">
      <div className="grid gap-6">
        <section className="overflow-hidden rounded-lg border border-white/10 bg-zinc-950/70 shadow-2xl shadow-black/40">
          <div className="grid gap-8 p-6 sm:p-8 xl:grid-cols-[1.08fr_0.92fr] xl:p-10">
            <div className="flex min-h-[440px] flex-col justify-between">
              <div>
                <div className="inline-flex rounded-full border border-[var(--border-subtle)] bg-[var(--surface-2)] px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-[var(--text-subtle)]">
                  Open-source AI ops console
                </div>
                <h1 className="mt-6 max-w-4xl text-4xl font-semibold leading-tight text-zinc-50 sm:text-5xl lg:text-6xl">
                  AI post-sales command center for customer conversations.
                </h1>
                <p className="mt-5 max-w-2xl text-base leading-7 text-zinc-400 sm:text-lg">
                  Linea turns customer messages into cases, CSM tasks, product
                  signals, and account health updates &mdash; with every action
                  visible and auditable.
                </p>
              </div>

              <div className="mt-10 grid gap-3 sm:grid-cols-2">
                <Link
                  href="/chat"
                  className="group rounded-lg border border-cyan-300/20 bg-cyan-300/10 p-5 transition hover:border-cyan-200/40 hover:bg-cyan-300/15 focus:outline-none focus:ring-2 focus:ring-cyan-300/40"
                >
                  <p className="text-sm font-medium uppercase tracking-[0.16em] text-cyan-200">
                    Run a demo message
                  </p>
                  <p className="mt-3 text-2xl font-semibold text-zinc-50">
                    Try intake
                  </p>
                  <p className="mt-3 text-sm text-zinc-400">
                    Send a customer message through the local agent workflow.
                  </p>
                </Link>
                <Link
                  href="/dashboard"
                  className="group rounded-lg border border-white/10 bg-white/[0.04] p-5 transition hover:border-white/20 hover:bg-white/[0.07] focus:outline-none focus:ring-2 focus:ring-cyan-300/40"
                >
                  <p className="text-sm font-medium uppercase tracking-[0.16em] text-zinc-500">
                    View command center
                  </p>
                  <p className="mt-3 text-2xl font-semibold text-zinc-50">
                    Review operations
                  </p>
                  <p className="mt-3 text-sm text-zinc-400">
                    Inspect account risk, tasks, product signals, and cases.
                  </p>
                </Link>
              </div>
            </div>

            <Panel
              eyebrow="Workflow"
              title="Intake execution log"
              className="bg-black/40"
            >
              <WorkflowLog
                items={workflow.map((item) => ({ ...item, state: "done" }))}
              />
            </Panel>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {features.map((feature) => (
            <Panel key={feature.title} title={feature.title}>
              <p className="text-sm leading-6 text-zinc-400">
                {feature.body}
              </p>
            </Panel>
          ))}
        </section>
      </div>
    </AppShell>
  );
}
