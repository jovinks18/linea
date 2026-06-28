"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function FlagReviewButton({
  caseNumber,
  initialRequiresReview = false,
  onFlagged,
}: {
  caseNumber: string;
  initialRequiresReview?: boolean;
  onFlagged?: () => void;
}) {
  const router = useRouter();
  const [requiresReview, setRequiresReview] = useState(initialRequiresReview);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function flagForReview() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch(
        `/api/cases/${encodeURIComponent(caseNumber)}/flag-review`,
        { method: "POST" }
      );

      if (!response.ok) {
        throw new Error("Review flag request failed");
      }

      setRequiresReview(true);
      onFlagged?.();
      router.refresh();
    } catch {
      setError("Could not flag this case. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid justify-items-start gap-2 sm:justify-items-end">
      <button
        type="button"
        onClick={flagForReview}
        disabled={loading || requiresReview}
        className="rounded-lg border border-[var(--border-strong)] bg-[var(--surface-2)] px-3 py-2 text-sm font-medium text-[var(--text-primary)] transition hover:bg-[var(--surface-3)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading
          ? "Flagging review..."
          : requiresReview
            ? "Human review flagged"
            : "Flag for human review / Override"}
      </button>
      <p
        aria-live="polite"
        className={`text-xs ${
          error ? "text-[var(--status-red-text)]" : "text-[var(--text-muted)]"
        }`}
      >
        {error || (requiresReview ? "Added to the Command Center queue." : "")}
      </p>
    </div>
  );
}
