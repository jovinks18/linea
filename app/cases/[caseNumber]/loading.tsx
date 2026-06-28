export default function CaseDetailLoading() {
  return (
    <div className="min-h-screen bg-[var(--background)] p-6 text-[var(--text-primary)]">
      <div className="mx-auto grid max-w-5xl gap-4" aria-busy="true">
        <p className="text-sm text-[var(--text-muted)]">Loading case detail...</p>
        {[1, 2, 3].map((item) => (
          <div
            key={item}
            className="h-32 animate-pulse rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-1)]"
          />
        ))}
      </div>
    </div>
  );
}
