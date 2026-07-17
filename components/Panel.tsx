export function Panel({
  children,
  title,
  eyebrow,
  action,
  className = "",
}: {
  children: React.ReactNode;
  title?: string;
  eyebrow?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-1)] shadow-[0_1px_0_rgba(255,255,255,0.04)] backdrop-blur ${className}`}
    >
      {(title || eyebrow || action) && (
        <div className="flex items-start justify-between gap-4 border-b border-[var(--border-subtle)] px-5 py-4 sm:px-6">
          <div>
            {eyebrow && (
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--text-subtle)]">
                {eyebrow}
              </p>
            )}
            {title && (
              <h2 className="mt-1 text-lg font-semibold leading-7 text-[var(--text-primary)]">
                {title}
              </h2>
            )}
          </div>
          {action}
        </div>
      )}
      <div className="p-5 sm:p-6">{children}</div>
    </section>
  );
}
