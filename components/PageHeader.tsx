export function PageBody({ children }: { children: React.ReactNode }) {
  return <div className="grid min-w-0 gap-5 lg:gap-6">{children}</div>;
}

export function PageHeader({
  action,
  description,
  eyebrow,
  title,
}: {
  action?: React.ReactNode;
  description?: React.ReactNode;
  eyebrow?: string;
  title: string;
}) {
  return (
    <header className="flex min-w-0 flex-col gap-3 border-b border-[var(--border-subtle)] pb-4 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold leading-7 text-[var(--text-primary)] sm:text-2xl">
            {title}
          </h1>
          {eyebrow ? (
            <span className="text-xs font-medium uppercase tracking-[0.14em] text-[var(--text-subtle)]">
              {eyebrow}
            </span>
          ) : null}
        </div>
        {description ? (
          <p className="mt-1 max-w-3xl text-sm leading-6 text-[var(--text-muted)]">
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}
