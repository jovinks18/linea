"use client";

import { useState } from "react";
import { AppShell } from "../../components/AppShell";
import { Panel } from "../../components/Panel";
import { StatusPill } from "../../components/StatusPill";

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
  email: string;
  message: string;
};

const demoScenarios: DemoScenario[] = [
  {
    label: "API go-live blocker",
    email: "maya.chen@example.com",
    message:
      "Our API setup is still blocked and we are supposed to go live Friday.",
  },
  {
    label: "Smart lock issue",
    email: "maya.chen@example.com",
    message: "My smart lock is not responding after I changed the batteries.",
  },
  {
    label: "Unknown account blocker",
    email: "unknown.blocker@example.com",
    message:
      "Our API setup is still blocked and we are supposed to go live Friday.",
  },
];

const emptyPostSalesActions: PostSalesActions = {
  onboarding_blocker_detected: false,
  task_created: false,
  product_signal_created: false,
  health_event_created: false,
  account_health_updated: false,
};

const accountActionLabels: {
  key: keyof PostSalesActions;
  label: string;
}[] = [
  {
    key: "task_created",
    label: "CSM task created",
  },
  {
    key: "product_signal_created",
    label: "Product signal logged",
  },
  {
    key: "health_event_created",
    label: "Health event created",
  },
  {
    key: "account_health_updated",
    label: "Account health updated",
  },
];

function formatLabel(value: string | null | undefined) {
  if (!value) return "Not set";

  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatDate(value: string) {
  return new Date(value).toLocaleString();
}

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

export default function ChatPage() {
  const [email, setEmail] = useState("maya.chen@example.com");
  const [caseNumber, setCaseNumber] = useState("");
  const [message, setMessage] = useState(
    "My smart lock is not responding after I changed the batteries."
  );
  const [latestSubmittedMessage, setLatestSubmittedMessage] = useState("");

  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [reply, setReply] = useState<ChatResponse | null>(null);
  const [caseDetails, setCaseDetails] = useState<CaseDetails | null>(null);
  const [error, setError] = useState("");

  function applyDemoScenario(scenario: DemoScenario) {
    setEmail(scenario.email);
    setMessage(scenario.message);
    setCaseNumber("");
    setReply(null);
    setCaseDetails(null);
    setLatestSubmittedMessage("");
    setError("");
  }

  async function fetchCaseHistory(targetCaseNumber: string) {
    if (!targetCaseNumber) return;

    setHistoryLoading(true);
    setError("");

    try {
      const res = await fetch(`/api/cases/${targetCaseNumber}`);

      if (!res.ok) {
        throw new Error("Case not found");
      }

      const data = await res.json();
      setCaseDetails(data);
    } catch {
      setError("Could not load case history.");
      setCaseDetails(null);
    } finally {
      setHistoryLoading(false);
    }
  }

  async function sendMessage() {
    setLoading(true);
    setError("");
    setReply(null);

    try {
      const res = await fetch("/api/intake", {
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
      });

      if (!res.ok) {
        throw new Error("Request failed");
      }

      const data = await res.json();
      setReply(data);
      setCaseNumber(data.case_number);
      setLatestSubmittedMessage(message);

      await fetchCaseHistory(data.case_number);
    } catch {
      setError("Something went wrong. Check your API route.");
    } finally {
      setLoading(false);
    }
  }

  const actions = reply?.post_sales?.actions ?? emptyPostSalesActions;
  const account = reply?.post_sales?.account ?? null;
  const agentDecision = reply?.agent_decision;
  const completedActions = accountActionLabels.filter(
    (action) => actions[action.key]
  );

  return (
    <AppShell active="chat">
      <div className="grid gap-6">
        <header>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-cyan-300/80">
            Chat intake
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-zinc-50 sm:text-4xl">
            Run an intake workflow
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-400 sm:text-base">
            Send one customer message and see what Linea understood, which
            account it found, and which post-sales actions actually ran.
          </p>
        </header>

        <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
          <div className="grid gap-4">
            <Panel eyebrow="Demo" title="Try a demo scenario">
              <div className="grid gap-2">
                {demoScenarios.map((scenario) => (
                  <button
                    key={scenario.label}
                    type="button"
                    onClick={() => applyDemoScenario(scenario)}
                    className="rounded-lg border border-white/10 bg-black/25 px-3 py-2.5 text-left text-sm text-zinc-200 transition hover:border-cyan-300/30 hover:bg-cyan-300/10 focus:outline-none focus:ring-2 focus:ring-cyan-300/30"
                  >
                    {scenario.label}
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

                <div>
                  <label className="mb-2 block text-xs font-medium uppercase tracking-[0.14em] text-zinc-600">
                    Optional case restore
                  </label>
                  <div className="flex gap-2">
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
                </div>

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

          <div className="grid gap-4">
            <Panel
              eyebrow="Result"
              title={reply ? "Result Summary" : "Result Summary"}
              action={
                reply && (
                  <StatusPill variant="default">
                    {formatLabel(reply.status)}
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
                          variant={reply.priority === "P1" ? "danger" : "info"}
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
                            reply.sentiment === "negative"
                              ? "warning"
                              : "muted"
                          }
                        >
                          {formatLabel(reply.sentiment)}
                        </StatusPill>
                      }
                    />
                    <DetailRow
                      label="Human review"
                      value={
                        <StatusPill
                          variant={
                            agentDecision?.requires_human_review
                              ? "danger"
                              : "success"
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
                        <div className="mt-4 grid gap-4">
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
                                {formatLabel(agentDecision.classification)}
                              </StatusPill>
                            }
                          />
                          <DetailRow
                            label="Confidence"
                            value={`${Math.round(
                              agentDecision.confidence * 100
                            )}%`}
                          />
                          <DetailRow
                            label="Explanation"
                            value={agentDecision.reasoning_summary}
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
                            value={account.stage ?? "Not set"}
                          />
                          <DetailRow
                            label="Health"
                            value={
                              <StatusPill
                                variant={
                                  account.health_status === "at_risk"
                                    ? "danger"
                                    : "success"
                                }
                              >
                                {formatLabel(account.health_status)}
                              </StatusPill>
                            }
                          />
                          <div className="col-span-2">
                            <DetailRow
                              label="Owner"
                              value={account.owner_name ?? "Unassigned"}
                            />
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
                    <h2 className="text-sm font-semibold text-zinc-100">
                      Actions completed
                    </h2>
                    {completedActions.length > 0 ? (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {completedActions.map((action) => (
                          <StatusPill key={action.key} variant="success">
                            {action.label}
                          </StatusPill>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-3 text-sm text-zinc-500">
                        No account-level actions were executed.
                      </p>
                    )}
                  </section>

                  <section className="rounded-lg border border-cyan-300/15 bg-cyan-300/5 p-4">
                    <h2 className="text-sm font-semibold text-zinc-100">
                      Linea reply
                    </h2>
                    <p className="mt-3 text-sm leading-6 text-zinc-200">
                      {reply.response}
                    </p>
                  </section>

                  {agentDecision && (
                    <details className="rounded-lg border border-white/10 bg-black/20">
                      <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-zinc-300">
                        Technical agent decision
                      </summary>
                      <div className="grid gap-4 border-t border-white/10 p-4 text-sm">
                        <DetailRow
                          label="Classification"
                          value={agentDecision.classification}
                        />
                        <DetailRow
                          label="Confidence"
                          value={agentDecision.confidence}
                        />
                        <DetailRow
                          label="Recommended actions"
                          value={
                            agentDecision.recommended_actions.length > 0
                              ? agentDecision.recommended_actions.join(", ")
                              : "None"
                          }
                        />
                        <DetailRow
                          label="Executed actions"
                          value={
                            agentDecision.executed_actions.length > 0
                              ? agentDecision.executed_actions.join(", ")
                              : "None"
                          }
                        />
                        <DetailRow
                          label="Requires human review"
                          value={String(agentDecision.requires_human_review)}
                        />
                      </div>
                    </details>
                  )}

                  <details className="rounded-lg border border-white/10 bg-black/20">
                    <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-zinc-300">
                      Conversation timeline
                    </summary>
                    <div className="border-t border-white/10 p-4">
                      {historyLoading && (
                        <p className="text-sm text-zinc-500">
                          Loading case history...
                        </p>
                      )}

                      {!historyLoading && !caseDetails && (
                        <p className="text-sm text-zinc-500">
                          Enter a case number and click Load, or send a new
                          message to create a case.
                        </p>
                      )}

                      {caseDetails && (
                        <div className="grid gap-4">
                          <div className="grid gap-3 rounded-lg border border-white/10 bg-black/25 p-4 text-sm sm:grid-cols-2">
                            <DetailRow
                              label="Case"
                              value={caseDetails.case.case_number}
                            />
                            <DetailRow
                              label="Customer"
                              value={caseDetails.case.customer_email}
                            />
                            <DetailRow
                              label="Subject"
                              value={caseDetails.case.subject}
                            />
                            <DetailRow
                              label="Last activity"
                              value={formatDate(
                                caseDetails.case.last_activity_at
                              )}
                            />
                          </div>

                          <div className="grid gap-3">
                            {caseDetails.messages.map((msg) => (
                              <div
                                key={msg.id}
                                className="rounded-lg border border-white/10 bg-black/25 p-4"
                              >
                                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                                  <p className="text-sm font-medium text-zinc-200">
                                    {formatLabel(msg.sender_type)}
                                  </p>
                                  <p className="text-xs text-zinc-600">
                                    {formatDate(msg.created_at)}
                                  </p>
                                </div>
                                <p className="mt-3 text-sm leading-6 text-zinc-400">
                                  {msg.message_text}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </details>
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
        </div>
      </div>
    </AppShell>
  );
}
