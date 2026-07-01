import type {
  PolicyImpactStatus,
  PolicyImpactSummary,
} from "../lib/agent/autonomy-policy-simulation";
import { formatOperatorDateTime } from "../lib/ui/datetime";
import {
  StatusPill,
  type StatusPillVariant,
} from "./StatusPill";

function formatLabel(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function statusVariant(status: PolicyImpactStatus): StatusPillVariant {
  if (status === "executed") return "success";
  if (status === "suggested") return "warning";
  if (status === "failed") return "danger";
  return "muted";
}

function formatConfidence(confidence: number | null) {
  return confidence === null
    ? "Not recorded"
    : `${Math.round(confidence * 100)}%`;
}

export function PolicyImpactPreview({
  impact,
}: {
  impact: PolicyImpactSummary;
}) {
  const unchanged =
    impact.would_remain_executed +
    impact.would_remain_suggested +
    impact.would_remain_skipped_or_failed;
  const metrics = [
    ["Examined", impact.total_actions_examined],
    ["Matching scope", impact.actions_matching_policy_scope],
    [
      "Suggested → executed",
      impact.would_change_suggested_to_executed,
    ],
    [
      "Executed → suggested",
      impact.would_change_executed_to_suggested,
    ],
    ["Unchanged", unchanged],
    ["Not simulatable", impact.not_simulatable],
  ] as const;

  return (
    <section
      aria-label="Policy impact preview"
      className="rounded-lg border border-[var(--border-strong)] bg-[var(--surface-1)] p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-[var(--text-subtle)]">
            Read-only impact preview
          </p>
          <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
            Replays recent audited actions against the proposed policy.
          </p>
        </div>
        <StatusPill variant="default">
          {impact.guard_failures} guard failures
        </StatusPill>
      </div>

      <dl className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {metrics.map(([label, value]) => (
          <div
            key={label}
            className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-2)] px-3 py-3"
          >
            <dt className="text-xs text-[var(--text-subtle)]">{label}</dt>
            <dd className="mt-1 text-lg font-semibold text-[var(--text-primary)]">
              {value}
            </dd>
          </div>
        ))}
      </dl>

      {impact.limitations.length > 0 ? (
        <div className="mt-4 rounded-lg border border-[var(--status-amber-border)] bg-[var(--status-amber-bg)] p-3">
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--status-amber-text)]">
            Scope limitation
          </p>
          {impact.limitations.map((limitation) => (
            <p
              key={limitation}
              className="mt-2 text-xs leading-5 text-[var(--text-secondary)]"
            >
              {limitation}
            </p>
          ))}
        </div>
      ) : null}

      {impact.sample_impacts.length === 0 ? (
        <p className="mt-4 rounded-lg border border-dashed border-[var(--border-subtle)] p-4 text-sm text-[var(--text-muted)]">
          No recent actions matched this policy scope.
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-lg border border-[var(--border-subtle)]">
          <table className="w-full min-w-[760px] border-collapse text-left">
            <thead className="bg-[var(--surface-3)]">
              <tr className="text-xs font-medium uppercase tracking-[0.1em] text-[var(--text-subtle)]">
                <th scope="col" className="px-3 py-2">
                  Case
                </th>
                <th scope="col" className="px-3 py-2">
                  Current
                </th>
                <th scope="col" className="px-3 py-2">
                  Simulated
                </th>
                <th scope="col" className="px-3 py-2">
                  Confidence
                </th>
                <th scope="col" className="px-3 py-2">
                  Scope
                </th>
                <th scope="col" className="px-3 py-2">
                  Reason
                </th>
                <th scope="col" className="px-3 py-2">
                  Recorded
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {impact.sample_impacts.map((sample) => (
                <tr
                  key={sample.id}
                  className="bg-[var(--surface-2)] text-xs text-[var(--text-secondary)]"
                >
                  <td className="px-3 py-3 font-mono text-[var(--text-primary)]">
                    {sample.case_number ?? "No case"}
                  </td>
                  <td className="px-3 py-3">
                    <StatusPill variant={statusVariant(sample.current_status)}>
                      {formatLabel(sample.current_status)}
                    </StatusPill>
                  </td>
                  <td className="px-3 py-3">
                    <StatusPill
                      variant={statusVariant(sample.simulated_status)}
                    >
                      {formatLabel(sample.simulated_status)}
                    </StatusPill>
                  </td>
                  <td className="px-3 py-3">
                    {formatConfidence(sample.confidence)}
                  </td>
                  <td className="px-3 py-3">
                    {sample.blast_radius_scope
                      ? formatLabel(sample.blast_radius_scope)
                      : "Not recorded"}
                  </td>
                  <td className="max-w-64 px-3 py-3 leading-5">
                    {sample.reason}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-[var(--text-subtle)]">
                    <time dateTime={sample.created_at}>
                      {formatOperatorDateTime(sample.created_at)}
                    </time>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
