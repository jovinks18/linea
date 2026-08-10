"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

const operatorSignInMessage = "Sign in as an operator to flag this case.";

export function FlagReviewButton({
  caseNumber,
  initialRequiresReview = false,
  operatorAuthenticated = false,
  onFlagged,
}: {
  caseNumber: string;
  initialRequiresReview?: boolean;
  operatorAuthenticated?: boolean;
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
        if (response.status === 401) {
          throw new Error(operatorSignInMessage);
        }

        let message = "Could not flag this case. Try again.";

        try {
          const body = (await response.json()) as { errors?: unknown };
          if (Array.isArray(body.errors) && body.errors.length > 0) {
            message = body.errors.filter(Boolean).join(" ");
          }
        } catch {
          // Keep the generic fallback when the response is not JSON.
        }

        throw new Error(message);
      }

      setRequiresReview(true);
      onFlagged?.();
      router.refresh();
    } catch (flagError) {
      setError(
        flagError instanceof Error
          ? flagError.message
          : "Could not flag this case. Try again."
      );
    } finally {
      setLoading(false);
    }
  }

  if (!operatorAuthenticated && !requiresReview) {
    return (
      <div className="grid justify-items-start gap-2 sm:justify-items-end">
        <Link
          href="/login"
          className="rounded-lg border border-[var(--border-strong)] bg-[var(--surface-2)] px-4 py-2.5 text-sm font-semibold text-[var(--text-secondary)] transition hover:border-[var(--accent)] hover:text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
        >
          Sign in to flag
        </Link>
        <p aria-live="polite" className="text-xs text-[var(--text-muted)]">
          {operatorSignInMessage}
        </p>
      </div>
    );
  }

  return (
    <div className="grid justify-items-start gap-2 sm:justify-items-end">
      <button
        type="button"
        onClick={flagForReview}
        disabled={loading || requiresReview}
        className="rounded-lg border border-[var(--accent)] bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-[var(--background)] shadow-[0_0_0_1px_var(--accent-muted)] transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40 disabled:cursor-not-allowed disabled:border-[var(--border-strong)] disabled:bg-[var(--surface-2)] disabled:text-[var(--text-muted)] disabled:shadow-none"
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
