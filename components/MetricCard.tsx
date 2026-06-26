export function MetricCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: number | string;
  detail?: string;
}) {
  return (
    <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-1)] p-4 shadow-[0_1px_0_rgba(255,255,255,0.04)]">
      <p className="text-xs font-medium uppercase tracking-[0.16em] text-[var(--text-subtle)]">
        {label}
      </p>
      <p className="mt-3 text-3xl font-semibold text-[var(--text-primary)]">
        {value}
      </p>
      {detail && (
        <p className="mt-2 text-sm text-[var(--text-muted)]">{detail}</p>
      )}
    </div>
  );
}
