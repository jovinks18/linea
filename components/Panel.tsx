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
      className={`rounded-lg border border-white/10 bg-zinc-950/70 shadow-[0_1px_0_rgba(255,255,255,0.04)] backdrop-blur ${className}`}
    >
      {(title || eyebrow || action) && (
        <div className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4">
          <div>
            {eyebrow && (
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-cyan-300/80">
                {eyebrow}
              </p>
            )}
            {title && (
              <h2 className="mt-1 text-base font-semibold text-zinc-50">
                {title}
              </h2>
            )}
          </div>
          {action}
        </div>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}
