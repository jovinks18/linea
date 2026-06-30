import { redirect } from "next/navigation";
import { OperatorLoginForm } from "../../components/OperatorLoginForm";
import { getCurrentOperator } from "../../lib/auth/current-operator";

export const dynamic = "force-dynamic";

function safeReturnPath(value: string | undefined) {
  return value?.startsWith("/admin/") ? value : "/admin/policies";
}

export default async function OperatorLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const operator = await getCurrentOperator();
  const { returnTo } = await searchParams;
  const destination = safeReturnPath(returnTo);

  if (operator) redirect(destination);

  return (
    <main className="relative flex min-h-screen items-center justify-center bg-[var(--background)] px-4 py-10 text-[var(--text-primary)]">
      <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(var(--border-subtle)_1px,transparent_1px),linear-gradient(90deg,var(--border-subtle)_1px,transparent_1px)] bg-[size:44px_44px]" />
      <div className="relative w-full max-w-md">
        <div className="mb-6">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--text-subtle)]">
            Linea control plane
          </p>
          <h1 className="mt-2 text-3xl font-semibold">Operator sign-in</h1>
          <p className="mt-3 text-sm leading-6 text-[var(--text-muted)]">
            Policy changes and approvals are attributed to this verified
            session. Actor identity cannot be supplied by an API request.
          </p>
        </div>
        <OperatorLoginForm returnTo={destination} />
      </div>
    </main>
  );
}
