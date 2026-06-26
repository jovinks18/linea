type StatusPillVariant =
  | "default"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "muted";

const variantClasses: Record<StatusPillVariant, string> = {
  default: "border-white/10 bg-white/5 text-zinc-200",
  success: "border-emerald-400/20 bg-emerald-400/10 text-emerald-200",
  warning: "border-amber-400/20 bg-amber-400/10 text-amber-200",
  danger: "border-rose-400/20 bg-rose-400/10 text-rose-200",
  info: "border-cyan-400/20 bg-cyan-400/10 text-cyan-200",
  muted: "border-white/10 bg-zinc-950/70 text-zinc-500",
};

export function StatusPill({
  children,
  variant = "default",
  className = "",
}: {
  children: React.ReactNode;
  variant?: StatusPillVariant;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${variantClasses[variant]} ${className}`}
    >
      {children}
    </span>
  );
}
