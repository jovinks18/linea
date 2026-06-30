"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { StatusPill } from "./StatusPill";

type PolicySnapshot = {
  tier: string;
  confidence_floor: number;
  max_blast_radius: number;
  requires_reversible: boolean;
};

export type PendingPolicyChangeRequest = {
  id: string;
  action_type: string;
  segment: string | null;
  old_policy: PolicySnapshot;
  proposed_policy: PolicySnapshot;
  requested_by: string;
  request_reason: string;
  created_at: string;
  risk_reasons: string[];
};

type ReviewState = {
  id: string;
  reviewedBy: string;
  reviewReason: string;
};

function formatLabel(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatSegment(segment: string | null) {
  return segment === null ? "Default" : formatLabel(segment);
}

function Snapshot({
  label,
  policy,
}: {
  label: string;
  policy: PolicySnapshot;
}) {
  return (
    <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-1)] p-4">
      <p className="text-xs font-medium uppercase tracking-[0.14em] text-[var(--text-subtle)]">
        {label}
      </p>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
        <dt className="text-[var(--text-subtle)]">Tier</dt>
        <dd className="text-right text-[var(--text-primary)]">
          {formatLabel(policy.tier)}
        </dd>
        <dt className="text-[var(--text-subtle)]">Confidence</dt>
        <dd className="text-right text-[var(--text-primary)]">
          {Math.round(policy.confidence_floor * 100)}%
        </dd>
        <dt className="text-[var(--text-subtle)]">Blast radius</dt>
        <dd className="text-right text-[var(--text-primary)]">
          {policy.max_blast_radius}
        </dd>
        <dt className="text-[var(--text-subtle)]">Reversible required</dt>
        <dd className="text-right text-[var(--text-primary)]">
          {policy.requires_reversible ? "Yes" : "No"}
        </dd>
      </dl>
    </div>
  );
}

export function PolicyChangeRequestsPanel({
  requests,
}: {
  requests: PendingPolicyChangeRequest[];
}) {
  const router = useRouter();
  const [review, setReview] = useState<ReviewState | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState<"approve" | "reject" | null>(null);

  function startReview(id: string) {
    setReview({ id, reviewedBy: "", reviewReason: "" });
    setErrors([]);
    setNotice(null);
  }

  async function submitReview(decision: "approve" | "reject") {
    if (!review || saving) return;

    setSaving(decision);
    setErrors([]);
    setNotice(null);

    try {
      const response = await fetch(
        `/api/admin/policy-change-requests/${review.id}/${decision}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            reviewed_by: review.reviewedBy,
            review_reason: review.reviewReason,
          }),
        }
      );
      const result = (await response.json()) as { errors?: string[] };

      if (!response.ok) {
        setErrors(
          result.errors?.length
            ? result.errors
            : ["Policy review failed unexpectedly."]
        );
        return;
      }

      setReview(null);
      setNotice(
        decision === "approve"
          ? "Change request approved and policy updated."
          : "Change request rejected. Effective policy was not changed."
      );
      router.refresh();
    } catch {
      setErrors(["Policy review could not reach the local server."]);
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="grid gap-4">
      {notice ? (
        <div
          role="status"
          className="rounded-lg border border-[var(--status-green-border)] bg-[var(--status-green-bg)] px-4 py-3 text-sm text-[var(--status-green-text)]"
        >
          {notice}
        </div>
      ) : null}

      {requests.map((request) => {
        const isReviewing = review?.id === request.id;

        return (
          <article
            key={request.id}
            className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-2)] p-5"
          >
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-mono text-sm font-medium text-[var(--text-primary)]">
                    Request #{request.id}
                  </p>
                  <StatusPill variant="warning">Pending</StatusPill>
                  <StatusPill variant="default">
                    {formatSegment(request.segment)}
                  </StatusPill>
                </div>
                <p className="mt-2 font-mono text-xs text-[var(--text-secondary)]">
                  {request.action_type}
                </p>
                <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
                  {request.request_reason}
                </p>
                <p className="mt-2 text-xs text-[var(--text-subtle)]">
                  Requested by {request.requested_by} on{" "}
                  {new Date(request.created_at).toLocaleString()}
                </p>
              </div>
              <button
                type="button"
                aria-expanded={isReviewing}
                onClick={() =>
                  isReviewing ? setReview(null) : startReview(request.id)
                }
                className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-3)] px-3 py-2 text-xs font-medium text-[var(--text-primary)] transition hover:border-[var(--border-strong)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
              >
                {isReviewing ? "Close review" : "Review request"}
              </button>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1fr_minmax(0,1.2fr)]">
              <Snapshot label="Current policy" policy={request.old_policy} />
              <Snapshot
                label="Proposed policy"
                policy={request.proposed_policy}
              />
              <div className="rounded-lg border border-[var(--status-amber-border)] bg-[var(--status-amber-bg)] p-4">
                <p className="text-xs font-medium uppercase tracking-[0.14em] text-[var(--status-amber-text)]">
                  Why approval is required
                </p>
                <ul className="mt-3 grid gap-2 text-sm leading-5 text-[var(--text-secondary)]">
                  {request.risk_reasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              </div>
            </div>

            {isReviewing && review ? (
              <form
                noValidate
                onSubmit={(event) => {
                  event.preventDefault();
                  void submitReview("approve");
                }}
                className="mt-5 grid gap-4 border-t border-[var(--border-subtle)] pt-5"
              >
                {errors.length > 0 ? (
                  <div
                    role="alert"
                    className="rounded-lg border border-[var(--status-red-border)] bg-[var(--status-red-bg)] p-4"
                  >
                    <p className="font-medium text-[var(--status-red-text)]">
                      Review blocked
                    </p>
                    <ul className="mt-2 grid gap-1 text-sm text-[var(--status-red-text)]">
                      {errors.map((error) => (
                        <li key={error}>{error}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                <div className="grid gap-4 md:grid-cols-2">
                  <label className="grid gap-2 text-sm text-[var(--text-secondary)]">
                    Reviewed by
                    <input
                      type="text"
                      value={review.reviewedBy}
                      onChange={(event) =>
                        setReview({
                          ...review,
                          reviewedBy: event.target.value,
                        })
                      }
                      placeholder="approver"
                      className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-1)] px-3 py-2 text-[var(--text-primary)] placeholder:text-[var(--text-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
                    />
                  </label>
                  <label className="grid gap-2 text-sm text-[var(--text-secondary)]">
                    Review reason
                    <textarea
                      rows={3}
                      value={review.reviewReason}
                      onChange={(event) =>
                        setReview({
                          ...review,
                          reviewReason: event.target.value,
                        })
                      }
                      placeholder="Explain the approval or rejection decision."
                      className="resize-y rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-1)] px-3 py-2 text-[var(--text-primary)] placeholder:text-[var(--text-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
                    />
                  </label>
                </div>

                <div className="flex flex-wrap justify-end gap-3">
                  <button
                    type="button"
                    disabled={saving !== null}
                    onClick={() => void submitReview("reject")}
                    className="rounded-lg border border-[var(--status-red-border)] bg-[var(--status-red-bg)] px-4 py-2 text-sm font-medium text-[var(--status-red-text)] focus:outline-none focus:ring-2 focus:ring-[var(--status-red-border)] disabled:opacity-50"
                  >
                    {saving === "reject" ? "Rejecting..." : "Reject"}
                  </button>
                  <button
                    type="submit"
                    disabled={saving !== null}
                    className="rounded-lg border border-[var(--status-green-border)] bg-[var(--status-green-bg)] px-4 py-2 text-sm font-medium text-[var(--status-green-text)] focus:outline-none focus:ring-2 focus:ring-[var(--status-green-border)] disabled:opacity-50"
                  >
                    {saving === "approve" ? "Approving..." : "Approve"}
                  </button>
                </div>
              </form>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}
