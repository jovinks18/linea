import Link from "next/link";

type NavKey = "home" | "chat" | "dashboard";

const navItems: { key: NavKey; label: string; href: string }[] = [
  { key: "home", label: "Home", href: "/" },
  { key: "chat", label: "Chat Intake", href: "/chat" },
  { key: "dashboard", label: "Command Center", href: "/dashboard" },
];

function Sidebar({ active }: { active: NavKey }) {
  return (
    <aside className="border-white/10 bg-zinc-950/85 backdrop-blur-xl lg:fixed lg:inset-y-0 lg:left-0 lg:w-72 lg:border-r">
      <div className="flex h-full flex-col gap-6 px-5 py-5">
        <div>
          <Link href="/" className="group flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-cyan-300/20 bg-cyan-300/10 font-mono text-sm font-semibold text-cyan-100">
              Li
            </span>
            <span>
              <span className="block text-lg font-semibold text-zinc-50">
                Linea
              </span>
              <span className="block text-xs text-zinc-500">
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
                    ? "border-cyan-300/20 bg-cyan-300/10 text-cyan-100"
                    : "border-transparent text-zinc-400 hover:border-white/10 hover:bg-white/5 hover:text-zinc-100"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto rounded-lg border border-white/10 bg-black/30 p-4">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">
            Local status
          </p>
          <div className="mt-4 grid gap-3 text-sm">
            {["Local mode", "PostgreSQL", "Deterministic agent"].map(
              (label) => (
                <div
                  key={label}
                  className="flex items-center justify-between gap-3"
                >
                  <span className="text-zinc-400">{label}</span>
                  <span className="flex items-center gap-2 text-emerald-200">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
                    Ready
                  </span>
                </div>
              )
            )}
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
    <div className="min-h-screen bg-[#050608] text-zinc-100">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.14),transparent_34%),radial-gradient(circle_at_80%_10%,rgba(16,185,129,0.08),transparent_28%),linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:auto,auto,44px_44px,44px_44px]" />
      <div className="relative lg:pl-72">
        <Sidebar active={active} />
        <main className="mx-auto min-h-screen w-full max-w-7xl px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
