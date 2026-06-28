import Link from "next/link";
import { notFound } from "next/navigation";
import { AccountMetadata } from "../../../components/AccountMetadata";
import { AppShell } from "../../../components/AppShell";
import { FlagReviewButton } from "../../../components/FlagReviewButton";
import { Panel } from "../../../components/Panel";
import { StatusPill } from "../../../components/StatusPill";
import { getCaseDetail } from "../../../lib/cases/detail-repository";
import {
  agentActionStatusVariant,
  healthVariant,
  priorityVariant,
  reviewVariant,
  sentimentVariant,
} from "../../../lib/ui/status";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function formatLabel(value: string | null | undefined) {
  if (!value) return "Not set";

  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString() : "Not set";
}

function Detail({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-[0.14em] text-[var(--text-subtle)]">
        {label}
      </dt>
      <dd className="mt-1 text-sm text-[var(--text-secondary)]">{children}</dd>
    </div>
  );
}

export default async function CaseDetailPage({
  params,
}: {
  params: Promise<{ caseNumber: string }>;
}) {
  const { caseNumber } = await params;
  const detail = await getCaseDetail(caseNumber);

  if (!detail) notFound();

  const agentDecision = detail.agent_decision;

  return (
    <AppShell active="dashboard">
      <div className="grid gap-6">
        <header className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
          <div>
            <Link
              href="/dashboard"
              className="text-sm text-[var(--text-muted)] underline decoration-[var(--border-strong)] underline-offset-4 hover:text-[var(--text-primary)]"
            >
              Back to Command Center
            </Link>
            <p className="mt-5 text-xs font-medium uppercase tracking-[0.18em] text-[var(--text-subtle)]">
              Case supervision
            </p>
            <h1 className="mt-2 font-mono text-2xl font-semibold text-[var(--text-primary)] sm:text-3xl">
              {detail.case.case_number}
            </h1>
            <p className="mt-2 text-base text-[var(--text-secondary)]">
              {detail.case.subject ?? "No subject"}
            </p>
          </div>
          <FlagReviewButton
            caseNumber={detail.case.case_number}
            initialRequiresReview={detail.case.requires_human_review}
          />
        </header>

        <section
          aria-label="Case status"
          className="flex flex-wrap gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-1)] p-4"
        >
          <StatusPill variant="default">
            {formatLabel(detail.case.status)}
          </StatusPill>
          <StatusPill variant={priorityVariant(detail.case.priority)}>
            {detail.case.priority}
          </StatusPill>
          <StatusPill variant={sentimentVariant(detail.case.sentiment)}>
            {formatLabel(detail.case.sentiment)}
          </StatusPill>
          <StatusPill
            variant={reviewVariant(detail.case.requires_human_review)}
          >
            {detail.case.requires_human_review
              ? "Human review required"
              : "No review required"}
          </StatusPill>
        </section>

        <div className="grid gap-6 xl:grid-cols-2">
          <Panel eyebrow="Customer" title="Case context">
            <dl className="grid gap-5 sm:grid-cols-2">
              <Detail label="Customer">
                {detail.case.customer_name ?? "Name not set"}
              </Detail>
              <Detail label="Email">{detail.case.customer_email}</Detail>
              <Detail label="Intent">
                {formatLabel(detail.case.intent)}
              </Detail>
              <Detail label="Channel">
                {formatLabel(detail.case.channel_origin)}
              </Detail>
              <Detail label="Review status">
                {formatLabel(detail.case.review_status)}
              </Detail>
              <Detail label="Last activity">
                {formatDate(detail.case.last_activity_at)}
              </Detail>
            </dl>
          </Panel>

          <Panel eyebrow="Account" title="Linked account">
            {detail.account ? (
              <div className="grid gap-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-[var(--text-primary)]">
                      {detail.account.name}
                    </p>
                    <p className="mt-1 text-sm text-[var(--text-muted)]">
                      {detail.account.plan ?? "No plan"} /{" "}
                      {detail.account.stage ?? "No stage"}
                    </p>
                  </div>
                  <StatusPill
                    variant={healthVariant(detail.account.health_status)}
                  >
                    {formatLabel(detail.account.health_status)}
                  </StatusPill>
                </div>
                <dl className="grid gap-4 sm:grid-cols-2">
                  <Detail label="Industry">
                    {detail.account.industry ?? "Not set"}
                  </Detail>
                  <Detail label="Owner">
                    {detail.account.owner_name ?? "Unassigned"}
                  </Detail>
                </dl>
                <AccountMetadata metadata={detail.account.metadata} />
              </div>
            ) : (
              <p className="text-sm text-[var(--text-muted)]">
                No linked account found.
              </p>
            )}
          </Panel>
        </div>

        <Panel eyebrow="Decision" title="Agent decision">
          {agentDecision ? (
            <div className="grid gap-6">
              <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
                <Detail label="Classification">
                  {formatLabel(agentDecision.classification)}
                </Detail>
                <Detail label="Confidence">
                  {Math.round(agentDecision.confidence * 100)}%
                </Detail>
                <Detail label="Source">
                  {formatLabel(agentDecision.source)}
                </Detail>
                <Detail label="Human review">
                  {agentDecision.requires_human_review ? "Required" : "Not required"}
                </Detail>
              </div>
              <p className="text-sm leading-6 text-[var(--text-secondary)]">
                {agentDecision.reasoning_summary}
              </p>
              <div className="grid gap-5 lg:grid-cols-2">
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.14em] text-[var(--text-subtle)]">
                    Recommended
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {agentDecision.recommended_actions.map((action) => (
                      <StatusPill key={action} variant="warning">
                        {formatLabel(action)}
                      </StatusPill>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.14em] text-[var(--text-subtle)]">
                    Executed
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {agentDecision.executed_actions.map((action) => (
                      <StatusPill key={action} variant="success">
                        {formatLabel(action)}
                      </StatusPill>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-[var(--text-muted)]">
              No persisted agent decision is available for this older case.
              The audit trail below remains authoritative.
            </p>
          )}
        </Panel>

        <Panel eyebrow="Conversation" title="Full timeline">
          {detail.messages.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">
              No messages recorded for this case.
            </p>
          ) : (
            <ol className="grid gap-3">
              {detail.messages.map((message) => (
                <li
                  key={message.id}
                  className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-2)] p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium text-[var(--text-primary)]">
                      {formatLabel(message.sender_type)}
                    </p>
                    <time
                      dateTime={message.created_at}
                      className="text-xs text-[var(--text-subtle)]"
                    >
                      {formatDate(message.created_at)}
                    </time>
                  </div>
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-[var(--text-secondary)]">
                    {message.message_text}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </Panel>

        <Panel eyebrow="Audit" title="Agent actions">
          {detail.agent_actions.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">
              No agent actions recorded for this case.
            </p>
          ) : (
            <div className="divide-y divide-[var(--border-subtle)] overflow-hidden rounded-lg border border-[var(--border-subtle)]">
              {detail.agent_actions.map((action) => {
                const reason =
                  typeof action.metadata.reason === "string"
                    ? action.metadata.reason
                    : null;

                return (
                  <article
                    key={action.id}
                    className="grid gap-3 bg-[var(--surface-2)] p-4 sm:grid-cols-[1fr_auto]"
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium text-[var(--text-primary)]">
                          {formatLabel(action.action_type)}
                        </p>
                        <StatusPill
                          variant={agentActionStatusVariant(action.status)}
                        >
                          {formatLabel(action.status)}
                        </StatusPill>
                      </div>
                      <p className="mt-2 text-xs text-[var(--text-muted)]">
                        Source: {formatLabel(action.source)}
                        {action.confidence
                          ? ` / ${Math.round(Number(action.confidence) * 100)}% confidence`
                          : ""}
                      </p>
                      {reason ? (
                        <p className="mt-2 text-xs text-[var(--status-amber-text)]">
                          {reason}
                        </p>
                      ) : null}
                    </div>
                    <time
                      dateTime={action.executed_at ?? action.created_at}
                      className="text-xs text-[var(--text-subtle)]"
                    >
                      {formatDate(action.executed_at ?? action.created_at)}
                    </time>
                  </article>
                );
              })}
            </div>
          )}
        </Panel>
      </div>
    </AppShell>
  );
}
