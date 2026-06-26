export function WorkflowLog({
  items,
}: {
  items: { label: string; detail?: string; state?: "done" | "idle" }[];
}) {
  return (
    <div className="divide-y divide-white/10 overflow-hidden rounded-lg border border-white/10 bg-black/30 font-mono text-sm">
      {items.map((item, index) => (
        <div
          key={`${item.label}-${index}`}
          className="grid gap-3 px-4 py-3 text-zinc-300 sm:grid-cols-[88px_1fr]"
        >
          <span className="text-xs uppercase tracking-[0.16em] text-zinc-600">
            step {String(index + 1).padStart(2, "0")}
          </span>
          <div>
            <div className="flex items-center gap-2">
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  item.state === "done" ? "bg-emerald-300" : "bg-cyan-300"
                }`}
              />
              <span className="text-zinc-100">{item.label}</span>
            </div>
            {item.detail && (
              <p className="mt-1 font-sans text-sm text-zinc-500">
                {item.detail}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
