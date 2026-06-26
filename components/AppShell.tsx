import Link from "next/link";
import { ThemeToggle } from "./ThemeToggle";

type NavKey = "home" | "chat" | "dashboard";

const navItems: { key: NavKey; label: string; href: string }[] = [
  { key: "home", label: "Home", href: "/" },
  { key: "chat", label: "Chat Intake", href: "/chat" },
  { key: "dashboard", label: "Command Center", href: "/dashboard" },
];

function Sidebar({ active }: { active: NavKey }) {
  return (
    <aside className="border-[var(--border-subtle)] bg-[var(--surface-1)]/90 backdrop-blur-xl lg:fixed lg:inset-y-0 lg:left-0 lg:w-72 lg:border-r">
      <div className="flex h-full flex-col gap-6 px-5 py-5">
        <div>
          <Link href="/" className="group flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border-strong)] bg-[var(--accent-muted)] font-mono text-sm font-semibold text-[var(--text-primary)]">
              Li
            </span>
            <span>
              <span className="block text-lg font-semibold text-[var(--text-primary)]">
                Linea
              </span>
              <span className="block text-xs text-[var(--text-muted)]">
                Post-sales agent workspace
              </span>
            </span>
          </Link>
        </div>

        <nav className="grid gap-1">
          {navItems.map((item) => {
            const isActive = item.key === active;

            return (
              <Link
                key={item.key}
                href={item.href}
                className={`rounded-lg border px-3 py-2.5 text-sm transition focus:outline-none focus:ring-2 focus:ring-cyan-300/40 ${
                  isActive
                    ? "border-[var(--border-strong)] bg-[var(--accent-muted)] text-[var(--text-primary)]"
                    : "border-transparent text-[var(--text-muted)] hover:border-[var(--border-subtle)] hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)]"
                }`}
                aria-current={isActive ? "page" : undefined}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-2)] p-4">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--text-subtle)]">
            Local status
          </p>
          <div className="mt-4 grid gap-3 text-sm">
            {["Local mode", "PostgreSQL", "Deterministic agent"].map(
              (label) => (
                <div
                  key={label}
                  className="flex items-center justify-between gap-3"
                >
                  <span className="text-[var(--text-muted)]">{label}</span>
                  <span className="flex items-center gap-2 text-[var(--status-green-text)]">
                    <span className="h-1.5 w-1.5 rounded-full bg-[var(--status-green-text)]" />
                    Ready
                  </span>
                </div>
              )
            )}
          </div>
          <div className="mt-4 border-t border-[var(--border-subtle)] pt-4">
            <ThemeToggle />
          </div>
        </div>
      </div>
    </aside>
  );
}

export function AppShell({
  active,
  children,
}: {
  active: NavKey;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--text-primary)]">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top_left,var(--accent-muted),transparent_34%),linear-gradient(var(--border-subtle)_1px,transparent_1px),linear-gradient(90deg,var(--border-subtle)_1px,transparent_1px)] bg-[size:auto,44px_44px,44px_44px]" />
      <div className="relative lg:pl-72">
        <Sidebar active={active} />
        <main className="mx-auto min-h-screen w-full max-w-7xl px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
