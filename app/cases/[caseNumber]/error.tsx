"use client";

export default function CaseDetailError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="grid min-h-screen place-items-center bg-[var(--background)] p-6 text-[var(--text-primary)]">
      <div className="max-w-md rounded-lg border border-[var(--status-red-border)] bg-[var(--status-red-bg)] p-6">
        <h1 className="text-lg font-semibold">Case detail unavailable</h1>
        <p className="mt-2 text-sm text-[var(--status-red-text)]">
          Linea could not load this case. Check the database and try again.
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-5 rounded-lg border border-[var(--status-red-border)] px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
        >
          Try again
        </button>
      </div>
    </main>
  );
}
