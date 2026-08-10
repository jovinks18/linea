"use client";

import { useEffect, useRef, useState } from "react";
import { AccountMetadata } from "../../components/AccountMetadata";
import { AppShell } from "../../components/AppShell";
import { FlagReviewButton } from "../../components/FlagReviewButton";
import { PageBody, PageHeader } from "../../components/PageHeader";
import { Panel } from "../../components/Panel";
import { StatusPill } from "../../components/StatusPill";
import {
  healthVariant,
  priorityVariant,
  reviewVariant,
  sentimentVariant,
} from "../../lib/ui/status";
import { formatDisplayLabel } from "../../lib/ui/labels";

type AgentDecision = {
  classification: string;
  confidence: number;
  reasoning_summary: string;
  recommended_actions: string[];
  executed_actions: string[];
  requires_human_review: boolean;
};

type ChatResponse = {
  case_number: string;
  response: string;
  status: string;
  intent?: string;
  sentiment?: string;
  priority?: string;
  post_sales?: {
    account: {
      id: number;
      name: string;
      industry: string | null;
      plan: string | null;
      stage: string | null;
      health_status: string | null;
      owner_name: string | null;
      metadata: Record<string, unknown>;
    } | null;
    actions?: PostSalesActions;
  };
  agent_decision?: AgentDecision;
};

type PostSalesActions = {
  onboarding_blocker_detected: boolean;
  task_created: boolean;
  product_signal_created: boolean;
  health_event_created: boolean;
  account_health_updated: boolean;
};

type CaseDetails = {
  case: {
    case_number: string;
    subject: string;
    status: string;
    intent: string;
    sentiment: string;
    priority: string;
    customer_name: string | null;
    customer_email: string;
    last_activity_at: string;
    requires_human_review: boolean;
    review_status: string;
  };
  messages: {
    id: number;
    sender_type: string;
    channel: string;
    message_text: string;
    ai_generated: boolean;
    created_at: string;
  }[];
};

type DemoScenario = {
  label: string;
  purpose: string;
  email: string;
  message: string;
};

const demoScenarios: DemoScenario[] = [
  {
    label: "API go-live blocker",
    purpose: "Proves linked-account automation and health-risk updates.",
    email: "maya.chen@example.com",
    message:
      "Our API setup is still blocked and we are supposed to go live Friday.",
  },
  {
    label: "Smart lock issue",
    purpose: "Proves P1 support triage without account-level automation.",
    email: "maya.chen@example.com",
    message: "My smart lock is not responding after I changed the batteries.",
  },
  {
    label: "Unknown account blocker",
    purpose: "Proves safe skips and required human review without an account.",
    email: "unlinked.blocker@synthetic.invalid",
    message:
      "Our API setup is still blocked and we are supposed to go live Friday.",
  },
];

const workflowSteps = [
  "Save message",
  "Lookup account",
  "Triage",
  "Decide policy",
  "Execute actions",
  "Audit result",
] as const;

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-[0.14em] text-zinc-600">
        {label}
      </p>
      <div className="mt-1 text-sm text-zinc-200">{value}</div>
    </div>
  );
}

export function ChatPageClient({
  operatorAuthenticated,
}: {
  operatorAuthenticated: boolean;
}) {
  const [email, setEmail] = useState("maya.chen@example.com");
  const [caseNumber, setCaseNumber] = useState("");
  const [message, setMessage] = useState(
    "My smart lock is not responding after I changed the batteries."
  );
  const [latestSubmittedMessage, setLatestSubmittedMessage] = useState("");
  const [activeScenario, setActiveScenario] = useState(
    demoScenarios[1].label
  );

  const [loading, setLoading] = useState(false);
  const [workflowStep, setWorkflowStep] = useState(0);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [reply, setReply] = useState<ChatResponse | null>(null);
  const [caseDetails, setCaseDetails] = useState<CaseDetails | null>(null);
  const [error, setError] = useState("");
  const intakeRequestId = useRef(0);
  const historyRequestId = useRef(0);

  useEffect(() => {
    if (!loading) return;

    const interval = window.setInterval(() => {
      setWorkflowStep((current) =>
        Math.min(current + 1, workflowSteps.length - 1)
      );
    }, 140);

    return () => window.clearInterval(interval);
  }, [loading]);

  function applyDemoScenario(scenario: DemoScenario) {
    intakeRequestId.current += 1;
    historyRequestId.current += 1;
    setActiveScenario(scenario.label);
    setEmail(scenario.email);
    setMessage(scenario.message);
    setCaseNumber("");
    setReply(null);
    setCaseDetails(null);
    setLatestSubmittedMessage("");
    setError("");
    setLoading(false);
    setHistoryLoading(false);
    setWorkflowStep(0);
  }

  async function fetchCaseHistory(targetCaseNumber: string) {
    if (!targetCaseNumber) return;

    const requestId = ++historyRequestId.current;
    setHistoryLoading(true);
    setError("");

    try {
      const res = await fetch(`/api/cases/${targetCaseNumber}`);

      if (!res.ok) {
        throw new Error("Case not found");
      }

      const data = await res.json();
      if (requestId === historyRequestId.current) {
        setCaseDetails(data);
      }
    } catch {
      if (requestId === historyRequestId.current) {
        setError("Could not load case history.");
        setCaseDetails(null);
      }
    } finally {
      if (requestId === historyRequestId.current) {
        setHistoryLoading(false);
      }
    }
  }

  async function sendMessage() {
    const requestId = ++intakeRequestId.current;
    setLoading(true);
    setWorkflowStep(0);
    setError("");
    setReply(null);

    try {
      const [res] = await Promise.all([
        fetch("/api/intake", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            channel: "web_chat",
            customer_email: email,
            case_number: caseNumber || null,
            message,
          }),
        }),
        new Promise((resolve) => window.setTimeout(resolve, 850)),
      ]);

      if (!res.ok) {
        throw new Error("Request failed");
      }

      const data = await res.json();
      if (requestId !== intakeRequestId.current) return;

      setReply(data);
      setCaseNumber(data.case_number);
      setLatestSubmittedMessage(message);

      await fetchCaseHistory(data.case_number);
    } catch {
      if (requestId === intakeRequestId.current) {
        setError("Something went wrong. Check your API route.");
      }
    } finally {
      if (requestId === intakeRequestId.current) {
        setLoading(false);
      }
    }
  }

  const account = reply?.post_sales?.account ?? null;
  const agentDecision = reply?.agent_decision;
  const completedActions = agentDecision?.executed_actions ?? [];
  const confidence = agentDecision
    ? Math.round(agentDecision.confidence * 100)
    : 0;
  const rawEvent = reply
    ? {
        response: reply,
        case: caseDetails?.case ?? null,
        messages: caseDetails?.messages ?? [],
      }
    : null;
  const hasResultColumn = Boolean(reply || loading);

  return (
    <AppShell active="chat">
      <PageBody>
        <PageHeader
          title="Chat intake"
          description="Run one customer message through account lookup, policy, execution, and audit."
        />

        <div
          className={`grid gap-5 ${
            hasResultColumn
              ? "xl:grid-cols-[400px_minmax(0,1fr)]"
              : "xl:max-w-4xl xl:grid-cols-[minmax(0,1fr)]"
          }`}
        >
          <div
            className={`grid gap-4 ${
              hasResultColumn
                ? ""
                : "xl:grid-cols-[320px_minmax(0,1fr)] xl:items-start"
            }`}
          >
            <Panel eyebrow="Demo" title="Try a demo scenario">
              <div className="grid gap-2">
                {demoScenarios.map((scenario) => (
                  <button
                    key={scenario.label}
                    type="button"
                    onClick={() => applyDemoScenario(scenario)}
                    className={`rounded-lg border px-3 py-2.5 text-left text-sm transition focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30 ${
                      activeScenario === scenario.label
                        ? "border-[var(--border-strong)] bg-[var(--accent-muted)] text-[var(--text-primary)]"
                        : "border-[var(--border-subtle)] bg-[var(--surface-2)] text-[var(--text-secondary)] hover:bg-[var(--surface-3)]"
                    }`}
                  >
                    <span className="block font-medium">{scenario.label}</span>
                    <span className="mt-1 block text-xs leading-5 text-[var(--text-muted)]">
                      {scenario.purpose}
                    </span>
                  </button>
                ))}
              </div>
            </Panel>

            <Panel eyebrow="Input" title="Customer message">
              <div className="space-y-4">
                <div>
                  <label className="mb-2 block text-sm font-medium text-zinc-300">
                    Customer email
                  </label>
                  <input
                    className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-3 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-cyan-300/50 focus:ring-2 focus:ring-cyan-300/20"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="maya.chen@example.com"
                  />
                </div>

                <details className="quiet-disclosure rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-2)] px-3 py-2">
                  <summary className="flex cursor-pointer items-center justify-between gap-3 text-sm font-medium text-[var(--text-muted)]">
                    <span>Optional case restore</span>
                    <span className="text-xs text-[var(--text-subtle)]">
                      Load existing case
                    </span>
                  </summary>
                  <div className="mt-3 flex gap-2">
                    <input
                      className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/25 px-3 py-2.5 text-sm text-zinc-300 outline-none transition placeholder:text-zinc-700 focus:border-cyan-300/40 focus:ring-2 focus:ring-cyan-300/15"
                      value={caseNumber}
                      onChange={(e) => setCaseNumber(e.target.value)}
                      placeholder="LIN-20260618-72TC"
                    />
                    <button
                      type="button"
                      onClick={() => fetchCaseHistory(caseNumber)}
                      disabled={!caseNumber || historyLoading}
                      className="rounded-lg border border-white/10 px-3 text-sm font-medium text-zinc-300 transition hover:border-white/20 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Load
                    </button>
                  </div>
                </details>

                <div>
                  <label className="mb-2 block text-sm font-medium text-zinc-300">
                    Message
                  </label>
                  <textarea
                    className="min-h-40 w-full resize-y rounded-lg border border-white/10 bg-black/40 px-3 py-3 text-sm leading-6 text-zinc-100 outline-none transition focus:border-cyan-300/50 focus:ring-2 focus:ring-cyan-300/20"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                  />
                </div>

                <button
                  type="button"
                  onClick={sendMessage}
                  disabled={loading}
                  className="w-full rounded-lg bg-zinc-100 px-4 py-3 text-sm font-semibold text-zinc-950 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? "Running workflow..." : "Run intake workflow"}
                </button>
              </div>

              {error && (
                <div className="mt-5 rounded-lg border border-rose-400/20 bg-rose-400/10 p-4 text-sm text-rose-100">
                  {error}
                </div>
              )}
            </Panel>
          </div>

          {hasResultColumn && (
          <div className="grid gap-4">
            <Panel
              eyebrow="Result"
            title={reply ? "Result Summary" : "Result Summary"}
              action={
                reply && (
                  <StatusPill variant="default">
                    {formatDisplayLabel(reply.status)}
                  </StatusPill>
                )
              }
            >
              {reply ? (
                <div className="grid gap-6">
                  <div className="rounded-lg border border-white/10 bg-black/25 p-4">
                    <p className="text-xs font-medium uppercase tracking-[0.14em] text-zinc-600">
                      Customer message
                    </p>
                    <p className="mt-2 text-sm leading-6 text-zinc-200">
                      {latestSubmittedMessage}
                    </p>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-4">
                    <DetailRow
                      label="Case"
                      value={
                        <span className="font-mono">{reply.case_number}</span>
                      }
                    />
                    <DetailRow
                      label="Priority"
                      value={
                        <StatusPill
                          variant={priorityVariant(reply.priority)}
                        >
                          {reply.priority ?? "P2"}
                        </StatusPill>
                      }
                    />
                    <DetailRow
                      label="Sentiment"
                      value={
                        <StatusPill
                          variant={
                            sentimentVariant(reply.sentiment)
                          }
                        >
                          {formatDisplayLabel(reply.sentiment)}
                        </StatusPill>
                      }
                    />
                    <DetailRow
                      label="Human review"
                      value={
                        <StatusPill
                          variant={
                            reviewVariant(
                              agentDecision?.requires_human_review ?? false
                            )
                          }
                        >
                          {agentDecision?.requires_human_review
                            ? "Required"
                            : "Not required"}
                        </StatusPill>
                      }
                    />
                  </div>

                  <div className="grid gap-4 lg:grid-cols-2">
                    <section className="rounded-lg border border-white/10 bg-black/25 p-4">
                      <h2 className="text-sm font-semibold text-zinc-100">
                        What Linea understood
                      </h2>
                      {agentDecision ? (
                        <div className="mt-4 grid gap-5">
                          <div>
                            <p className="text-xs font-medium uppercase tracking-[0.14em] text-[var(--text-subtle)]">
                              Explanation
                            </p>
                            <p className="mt-2 text-base font-medium leading-7 text-[var(--text-primary)]">
                              {agentDecision.reasoning_summary}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs font-medium uppercase tracking-[0.14em] text-[var(--text-subtle)]">
                              Agent confidence
                            </p>
                            <div className="mt-2 grid gap-2">
                              <span className="font-mono text-xl font-semibold text-[var(--text-primary)]">
                                {confidence}%
                              </span>
                              <span className="h-2 overflow-hidden rounded-full bg-[var(--surface-3)]">
                                <span
                                  className="block h-full rounded-full bg-[var(--accent)]"
                                  style={{ width: `${confidence}%` }}
                                />
                              </span>
                            </div>
                          </div>
                          <DetailRow
                            label="Type"
                            value={
                              <StatusPill
                                variant={
                                  agentDecision.classification ===
                                  "implementation_blocker"
                                    ? "warning"
                                    : "info"
                                }
                              >
                                {formatDisplayLabel(
                                  agentDecision.classification
                                )}
                              </StatusPill>
                            }
                          />
                        </div>
                      ) : (
                        <p className="mt-3 text-sm text-zinc-500">
                          Run a workflow to see Linea&apos;s interpretation.
                        </p>
                      )}
                    </section>

                    <section className="rounded-lg border border-white/10 bg-black/25 p-4">
                      <h2 className="text-sm font-semibold text-zinc-100">
                        Account
                      </h2>
                      {account ? (
                        <div className="mt-4 grid grid-cols-2 gap-4">
                          <DetailRow label="Name" value={account.name} />
                          <DetailRow
                            label="Plan"
                            value={account.plan ?? "Not set"}
                          />
                          <DetailRow
                            label="Stage"
                            value={formatDisplayLabel(account.stage)}
                          />
                          <DetailRow
                            label="Health"
                            value={
                              <StatusPill
                                variant={healthVariant(account.health_status)}
                              >
                                {formatDisplayLabel(account.health_status)}
                              </StatusPill>
                            }
                          />
                          <div className="col-span-2">
                            <DetailRow
                              label="Owner"
                              value={account.owner_name ?? "Unassigned"}
                            />
                          </div>
                          <div className="col-span-2">
                            <AccountMetadata metadata={account.metadata} />
                          </div>
                        </div>
                      ) : (
                        <p className="mt-3 text-sm text-zinc-500">
                          No linked account found.
                        </p>
                      )}
                    </section>
                  </div>

                  <section className="rounded-lg border border-white/10 bg-black/25 p-4">
                    <div className="border-l-2 border-[var(--accent)] pl-4">
                      <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                        Actions completed
                      </h2>
                      <p className="mt-1 text-xs text-[var(--text-muted)]">
                        What Linea actually executed for this intake.
                      </p>
                    </div>
                    <p className="mt-4 text-sm leading-6 text-[var(--text-secondary)]">
                      Actions auto-execute only for verified linked accounts.
                      Unknown accounts hold for human review.
                    </p>
                    {completedActions.length > 0 ? (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {completedActions.map((action) => (
                          <StatusPill key={action} variant="success">
                            {formatDisplayLabel(action)}
                          </StatusPill>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-3 text-sm text-zinc-500">
                        No account-level actions were executed.
                      </p>
                    )}
                  </section>

                  <div className="flex flex-col gap-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-2)] p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-[var(--text-primary)]">
                        Human supervision
                      </p>
                      <p className="mt-1 text-sm text-[var(--text-muted)]">
                        Operators can override or escalate any agent decision.
                      </p>
                    </div>
                    <FlagReviewButton
                      key={reply.case_number}
                      caseNumber={reply.case_number}
                      initialRequiresReview={
                        caseDetails?.case.requires_human_review ??
                        agentDecision?.requires_human_review ??
                        false
                      }
                      operatorAuthenticated={operatorAuthenticated}
                      onFlagged={() => {
                        setReply((current) =>
                          current?.agent_decision
                            ? {
                                ...current,
                                agent_decision: {
                                  ...current.agent_decision,
                                  requires_human_review: true,
                                },
                              }
                            : current
                        );
                        setCaseDetails((current) =>
                          current
                            ? {
                                ...current,
                                case: {
                                  ...current.case,
                                  requires_human_review: true,
                                  review_status: "flagged",
                                },
                              }
                            : current
                        );
                      }}
                    />
                  </div>

                  <section className="rounded-lg border border-cyan-300/15 bg-cyan-300/5 p-4">
                    <h2 className="text-sm font-semibold text-zinc-100">
                      Linea reply
                    </h2>
                    <p className="mt-3 text-sm leading-6 text-zinc-200">
                      {reply.response}
                    </p>
                  </section>

                  {rawEvent && (
                    <details className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-2)]">
                      <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-[var(--text-secondary)] marker:text-[var(--accent)]">
                        View raw event
                      </summary>
                      <div className="border-t border-[var(--border-subtle)] p-4">
                        {historyLoading && (
                          <p className="mb-3 text-sm text-[var(--text-muted)]">
                            Loading latest case snapshot...
                          </p>
                        )}
                        <pre className="max-h-80 overflow-auto rounded-lg bg-[var(--surface-1)] p-3 text-xs leading-5 text-[var(--text-muted)]">
                          {JSON.stringify(rawEvent, null, 2)}
                        </pre>
                      </div>
                    </details>
                  )}
                </div>
              ) : loading ? (
                <div className="grid gap-4 text-sm text-[var(--text-muted)]">
                  <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-2)] p-4">
                    <p className="font-medium text-[var(--text-primary)]">
                      Running intake workflow...
                    </p>
                    <p className="mt-2">
                      Linea is applying the deterministic workflow and recording
                      each outcome.
                    </p>
                  </div>
                  <ol
                    className="grid gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-2)] p-4"
                    aria-label="Intake workflow progress"
                    aria-live="polite"
                  >
                    {workflowSteps.map((step, index) => {
                      const complete = index < workflowStep;
                      const active = index === workflowStep;

                      return (
                        <li
                          key={step}
                          className="flex items-center gap-3 text-sm"
                        >
                          <span
                            aria-hidden="true"
                            className={`h-2 w-2 rounded-full ${
                              complete
                                ? "bg-[var(--status-green-text)]"
                                : active
                                  ? "bg-[var(--accent)]"
                                  : "bg-[var(--border-strong)]"
                            }`}
                          />
                          <span
                            className={
                              active
                                ? "font-medium text-[var(--text-primary)]"
                                : "text-[var(--text-muted)]"
                            }
                          >
                            {step}
                            {complete ? " completed" : active ? " in progress" : ""}
                          </span>
                        </li>
                      );
                    })}
                  </ol>
                </div>
              ) : (
                <div className="grid gap-4 text-sm text-zinc-500">
                  <p>
                    Choose a scenario or enter a customer message, then run the
                    intake workflow.
                  </p>
                  <div className="grid gap-3 rounded-lg border border-dashed border-white/10 bg-black/20 p-4">
                    <p className="text-zinc-400">
                      The summary will show what the customer sent, what Linea
                      understood, and what Linea did.
                    </p>
                  </div>
                </div>
              )}
            </Panel>
          </div>
          )}
        </div>
      </PageBody>
    </AppShell>
  );
}
