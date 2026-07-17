import Link from "next/link";
import { ThemeToggle } from "./ThemeToggle";

type NavKey = "home" | "chat" | "dashboard" | "data" | "policies";

const navItems: {
  key: NavKey;
  label: string;
  description: string;
  href: string;
}[] = [
  { key: "home", label: "Home", description: "Workspace overview", href: "/" },
  {
    key: "chat",
    label: "Chat Intake",
    description: "Run an agent workflow",
    href: "/chat",
  },
  {
    key: "dashboard",
    label: "Command Center",
    description: "Supervise post-sales activity",
    href: "/dashboard",
  },
  {
    key: "data",
    label: "Data Onboarding",
    description: "Profile, map, and import",
    href: "/data",
  },
  {
    key: "policies",
    label: "Policy Admin",
    description: "Inspect autonomy rules",
    href: "/admin/policies",
  },
];

function Sidebar({ active }: { active: NavKey }) {
  return (
    <aside className="border-[var(--border-subtle)] bg-[var(--surface-1)]/90 backdrop-blur-xl lg:fixed lg:inset-y-0 lg:left-0 lg:w-72 lg:border-r">
      <div className="flex h-full flex-col gap-5 px-4 py-4 sm:px-5 sm:py-5 lg:gap-6">
        <div className="flex items-center justify-between gap-4">
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
          <div className="lg:hidden">
            <ThemeToggle />
          </div>
        </div>

        <nav className="grid grid-cols-2 gap-2 sm:grid-cols-5 lg:grid-cols-1 lg:gap-1">
          {navItems.map((item) => {
            const isActive = item.key === active;

            return (
              <Link
                key={item.key}
                href={item.href}
                className={`min-h-16 rounded-lg border px-3 py-2.5 text-sm transition focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40 lg:min-h-0 ${
                  isActive
                    ? "border-[var(--border-strong)] bg-[var(--accent-muted)] text-[var(--text-primary)]"
                    : "border-transparent text-[var(--text-muted)] hover:border-[var(--border-subtle)] hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)]"
                }`}
                aria-current={isActive ? "page" : undefined}
              >
                <span className="block font-medium">{item.label}</span>
                <span className="mt-1 hidden text-xs text-[var(--text-subtle)] lg:block">
                  {item.description}
                </span>
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto hidden lg:block">
          <ThemeToggle />
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
      <div className="relative lg:pl-72">
        <Sidebar active={active} />
        <main className="mx-auto min-h-screen w-full max-w-7xl px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
