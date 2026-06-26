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
    <div className="rounded-lg border border-white/10 bg-zinc-950/75 p-4 shadow-[0_1px_0_rgba(255,255,255,0.04)]">
      <p className="text-xs font-medium uppercase tracking-[0.16em] text-zinc-500">
        {label}
      </p>
      <p className="mt-3 text-3xl font-semibold text-zinc-50">{value}</p>
      {detail && <p className="mt-2 text-sm text-zinc-500">{detail}</p>}
    </div>
  );
}
