"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function OperatorIdentity({ username }: { username: string }) {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);

    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      router.replace("/login");
      router.refresh();
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-2)] px-3 py-2">
      <div>
        <p className="text-xs uppercase tracking-[0.12em] text-[var(--text-subtle)]">
          Authenticated operator
        </p>
        <p className="mt-1 font-mono text-xs text-[var(--text-primary)]">
          {username}
        </p>
      </div>
      <button
        type="button"
        onClick={() => void signOut()}
        disabled={signingOut}
        className="rounded-lg border border-[var(--border-subtle)] px-3 py-2 text-xs font-medium text-[var(--text-secondary)] transition hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40 disabled:opacity-50"
      >
        {signingOut ? "Signing out..." : "Sign out"}
      </button>
    </div>
  );
}
