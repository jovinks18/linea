"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function OperatorLoginForm({ returnTo }: { returnTo: string }) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [signingIn, setSigningIn] = useState(false);

  async function signIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (signingIn) return;

    setSigningIn(true);
    setErrors([]);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const result = (await response.json()) as { errors?: string[] };

      if (!response.ok) {
        setErrors(
          result.errors?.length
            ? result.errors
            : ["Operator sign-in failed unexpectedly."]
        );
        return;
      }

      router.replace(returnTo);
      router.refresh();
    } catch {
      setErrors(["Operator sign-in could not reach the local server."]);
    } finally {
      setSigningIn(false);
    }
  }

  return (
    <form
      noValidate
      onSubmit={signIn}
      className="grid gap-5 rounded-lg border border-[var(--border-strong)] bg-[var(--surface-2)] p-6"
    >
      {errors.length > 0 ? (
        <div
          role="alert"
          className="rounded-lg border border-[var(--status-red-border)] bg-[var(--status-red-bg)] p-4"
        >
          <p className="font-medium text-[var(--status-red-text)]">
            Sign-in blocked
          </p>
          {errors.map((error) => (
            <p
              key={error}
              className="mt-2 text-sm leading-5 text-[var(--status-red-text)]"
            >
              {error}
            </p>
          ))}
        </div>
      ) : null}

      <p className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-1)] p-3 text-sm leading-6 text-[var(--text-muted)]">
        Set <code>LINEA_ADMIN_USERNAME</code> and{" "}
        <code>LINEA_ADMIN_PASSWORD</code> in <code>.env.local</code>. See
        README.
      </p>

      <label className="grid gap-2 text-sm text-[var(--text-secondary)]">
        Operator username
        <input
          type="text"
          autoComplete="username"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-1)] px-3 py-2.5 text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
        />
      </label>

      <label className="grid gap-2 text-sm text-[var(--text-secondary)]">
        Password
        <input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-1)] px-3 py-2.5 text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
        />
      </label>

      <button
        type="submit"
        disabled={signingIn}
        className="rounded-lg border border-[var(--border-strong)] bg-[var(--accent-muted)] px-4 py-2.5 text-sm font-medium text-[var(--text-primary)] transition hover:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40 disabled:cursor-wait disabled:opacity-60"
      >
        {signingIn ? "Signing in..." : "Sign in"}
      </button>
    </form>
  );
}
