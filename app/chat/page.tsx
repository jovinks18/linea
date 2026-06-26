"use client";

import { useState } from "react";

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

const emptyPostSalesActions: PostSalesActions = {
  onboarding_blocker_detected: false,
  task_created: false,
  product_signal_created: false,
  health_event_created: false,
  account_health_updated: false,
};

const postSalesActionLabels: {
  key: keyof PostSalesActions;
  label: string;
}[] = [
  {
    key: "onboarding_blocker_detected",
    label: "Onboarding blocker detected",
  },
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

export default function ChatPage() {
  const [email, setEmail] = useState("maya.chen@example.com");
  const [caseNumber, setCaseNumber] = useState("");
  const [message, setMessage] = useState(
    "My smart lock is not responding after I changed the batteries."
  );

  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [reply, setReply] = useState<ChatResponse | null>(null);
  const [caseDetails, setCaseDetails] = useState<CaseDetails | null>(null);
  const [error, setError] = useState("");

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

      await fetchCaseHistory(data.case_number);
    } catch {
      setError("Something went wrong. Check your API route.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-white flex items-center justify-center px-6 py-10">
      <div className="w-full max-w-5xl grid gap-6 lg:grid-cols-[420px_1fr]">
        <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-6 shadow-xl">
          <div className="mb-6">
            <p className="text-sm text-neutral-400">Linea Demo</p>
            <h1 className="text-3xl font-semibold mt-1">AI Support Chat</h1>
            <p className="text-neutral-400 mt-2">
              Create or continue a customer support case.
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm mb-2 text-neutral-300">
                Customer Email
              </label>
              <input
                className="w-full rounded-lg bg-neutral-950 border border-neutral-700 px-4 py-3 outline-none focus:border-white"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="maya.chen@example.com"
              />
            </div>

            <div>
              <label className="block text-sm mb-2 text-neutral-300">
                Case Number Optional
              </label>
              <div className="flex gap-2">
                <input
                  className="w-full rounded-lg bg-neutral-950 border border-neutral-700 px-4 py-3 outline-none focus:border-white"
                  value={caseNumber}
                  onChange={(e) => setCaseNumber(e.target.value)}
                  placeholder="LIN-20260618-72TC"
                />
                <button
                  onClick={() => fetchCaseHistory(caseNumber)}
                  disabled={!caseNumber || historyLoading}
                  className="rounded-lg border border-neutral-700 px-4 text-sm disabled:opacity-50"
                >
                  Load
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm mb-2 text-neutral-300">
                Message
              </label>
              <textarea
                className="w-full min-h-32 rounded-lg bg-neutral-950 border border-neutral-700 px-4 py-3 outline-none focus:border-white"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
            </div>

            <button
              onClick={sendMessage}
              disabled={loading}
              className="w-full rounded-lg bg-white text-black py-3 font-medium disabled:opacity-50"
            >
              {loading ? "Sending..." : "Send to Linea"}
            </button>
          </div>

          {error && (
            <div className="mt-6 rounded-lg border border-red-900 bg-red-950 p-4 text-red-200">
              {error}
            </div>
          )}

          {reply && (
            <div className="mt-6 rounded-xl border border-neutral-800 bg-neutral-950 p-5">
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm text-neutral-400">Latest Case</p>
                <span className="rounded-full bg-neutral-800 px-3 py-1 text-sm">
                  {reply.status}
                </span>
              </div>

              <p className="text-lg font-medium">{reply.case_number}</p>

              <div className="mt-4 border-t border-neutral-800 pt-4">
                <p className="text-sm text-neutral-400 mb-2">Latest Response</p>
                <p className="text-neutral-100 leading-relaxed">
                  {reply.response}
                </p>
              </div>

              <div className="mt-4 border-t border-neutral-800 pt-4">
                <p className="text-sm text-neutral-400 mb-3">
                  Account Context
                </p>

                {reply.post_sales?.account ? (
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-neutral-500">Account</p>
                      <p>{reply.post_sales.account.name}</p>
                    </div>
                    <div>
                      <p className="text-neutral-500">Plan</p>
                      <p>{reply.post_sales.account.plan ?? "Not set"}</p>
                    </div>
                    <div>
                      <p className="text-neutral-500">Stage</p>
                      <p>{reply.post_sales.account.stage ?? "Not set"}</p>
                    </div>
                    <div>
                      <p className="text-neutral-500">Health</p>
                      <p>{reply.post_sales.account.health_status ?? "Not set"}</p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-neutral-500">Owner</p>
                      <p>{reply.post_sales.account.owner_name ?? "Unassigned"}</p>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-neutral-400">
                    No linked account found.
                  </p>
                )}
              </div>

              <div className="mt-4 border-t border-neutral-800 pt-4">
                <p className="text-sm text-neutral-400 mb-3">
                  Post-sales Actions
                </p>

                <div className="space-y-2">
                  {postSalesActionLabels.map((action) => {
                    const actions =
                      reply.post_sales?.actions ?? emptyPostSalesActions;
                    const triggered = actions[action.key];

                    return (
                      <div
                        key={action.key}
                        className="flex items-center justify-between gap-4 text-sm"
                      >
                        <span className="text-neutral-200">
                          {action.label}
                        </span>
                        <span
                          className={`rounded-full px-3 py-1 text-xs ${
                            triggered
                              ? "bg-emerald-950 text-emerald-200 border border-emerald-800"
                              : "bg-neutral-900 text-neutral-500 border border-neutral-800"
                          }`}
                        >
                          {triggered ? "Created" : "Not triggered"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-6 shadow-xl">
          <div className="mb-6">
            <p className="text-sm text-neutral-400">Case Timeline</p>
            <h2 className="text-2xl font-semibold mt-1">Conversation History</h2>
          </div>

          {historyLoading && (
            <p className="text-neutral-400">Loading case history...</p>
          )}

          {!historyLoading && !caseDetails && (
            <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-5 text-neutral-400">
              Enter a case number and click Load, or send a new message to create
              a case.
            </div>
          )}

          {caseDetails && (
            <div>
              <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-5 mb-5">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm text-neutral-400">Case Number</p>
                    <p className="text-lg font-medium">
                      {caseDetails.case.case_number}
                    </p>
                  </div>
                  <span className="rounded-full bg-neutral-800 px-3 py-1 text-sm">
                    {caseDetails.case.status}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-4 mt-5 text-sm">
                  <div>
                    <p className="text-neutral-500">Subject</p>
                    <p>{caseDetails.case.subject}</p>
                  </div>
                  <div>
                    <p className="text-neutral-500">Customer</p>
                    <p>{caseDetails.case.customer_email}</p>
                  </div>
                  <div>
                    <p className="text-neutral-500">Intent</p>
                    <p>{caseDetails.case.intent}</p>
                  </div>
                  <div>
                    <p className="text-neutral-500">Sentiment</p>
                    <p>{caseDetails.case.sentiment}</p>
                  </div>
                  <div>
                    <p className="text-neutral-500">Priority</p>
                    <p>{caseDetails.case.priority}</p>
                  </div>
                  <div>
                    <p className="text-neutral-500">Last Activity</p>
                    <p>
                      {new Date(
                        caseDetails.case.last_activity_at
                      ).toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                {caseDetails.messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`rounded-xl border p-4 ${
                      msg.sender_type === "customer"
                        ? "border-neutral-700 bg-neutral-950"
                        : "border-neutral-800 bg-neutral-800/60"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-medium capitalize">
                        {msg.sender_type}
                      </p>
                      <p className="text-xs text-neutral-500">
                        {new Date(msg.created_at).toLocaleString()}
                      </p>
                    </div>
                    <p className="text-neutral-200 leading-relaxed">
                      {msg.message_text}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
