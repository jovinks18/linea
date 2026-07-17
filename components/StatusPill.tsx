export type StatusPillVariant =
  | "default"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "muted";

const variantClasses: Record<StatusPillVariant, string> = {
  default:
    "border-[var(--status-neutral-border)] bg-[var(--status-neutral-bg)] text-[var(--status-neutral-text)]",
  success:
    "border-[var(--status-green-border)] bg-[var(--status-green-bg)] text-[var(--status-green-text)]",
  warning:
    "border-[var(--status-amber-border)] bg-[var(--status-amber-bg)] text-[var(--status-amber-text)]",
  danger:
    "border-[var(--status-red-border)] bg-[var(--status-red-bg)] text-[var(--status-red-text)]",
  info: "border-[var(--status-blue-border)] bg-[var(--status-blue-bg)] text-[var(--status-blue-text)]",
  muted:
    "border-[var(--status-neutral-border)] bg-transparent text-[var(--text-subtle)]",
};

export function StatusPill({
  children,
  title,
  variant = "default",
  className = "",
}: {
  children: React.ReactNode;
  title?: string;
  variant?: StatusPillVariant;
  className?: string;
}) {
  return (
    <span
      role="status"
      title={title}
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${variantClasses[variant]} ${className}`}
    >
      {children}
    </span>
  );
}
