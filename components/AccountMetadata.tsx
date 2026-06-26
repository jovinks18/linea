type AccountMetadataProps = {
  metadata: Record<string, unknown> | null | undefined;
};

const primaryKeys = ["arr", "renewal_date", "usage_score"] as const;

function formatLabel(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatValue(key: string, value: unknown) {
  if (key === "arr") {
    const amount = typeof value === "number" ? value : Number(value);

    if (Number.isFinite(amount)) {
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
      }).format(amount);
    }
  }

  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  try {
    return JSON.stringify(value);
  } catch {
    return "Unavailable";
  }
}

function hasDisplayValue(value: unknown) {
  return value !== null && value !== undefined && value !== "";
}

export function AccountMetadata({ metadata }: AccountMetadataProps) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const entries = Object.entries(metadata).filter(([, value]) =>
    hasDisplayValue(value)
  );
  if (entries.length === 0) return null;

  const primaryEntries = primaryKeys
    .filter((key) => hasDisplayValue(metadata[key]))
    .map((key) => [key, metadata[key]] as const);
  const additionalEntries = entries
    .filter(([key]) => !primaryKeys.includes(key as (typeof primaryKeys)[number]))
    .sort(([left], [right]) => left.localeCompare(right));

  return (
    <div className="border-t border-[var(--border-subtle)] pt-4">
      <p className="text-xs font-medium uppercase tracking-[0.14em] text-[var(--text-subtle)]">
        Imported context
      </p>

      {primaryEntries.length > 0 && (
        <dl className="mt-3 grid gap-3 sm:grid-cols-3">
          {primaryEntries.map(([key, value]) => (
            <div key={key} className="min-w-0">
              <dt className="text-xs text-[var(--text-subtle)]">
                {formatLabel(key)}
              </dt>
              <dd className="mt-1 break-words text-sm font-medium text-[var(--text-secondary)]">
                {formatValue(key, value)}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {additionalEntries.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-medium text-[var(--text-muted)] marker:text-[var(--accent)]">
            Additional fields ({additionalEntries.length})
          </summary>
          <dl className="mt-3 divide-y divide-[var(--border-subtle)] rounded-lg border border-[var(--border-subtle)] px-3">
            {additionalEntries.map(([key, value]) => (
              <div
                key={key}
                className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-3 py-2 text-xs"
              >
                <dt className="break-words text-[var(--text-subtle)]">
                  {formatLabel(key)}
                </dt>
                <dd className="break-words text-right text-[var(--text-secondary)]">
                  {formatValue(key, value)}
                </dd>
              </div>
            ))}
          </dl>
        </details>
      )}
    </div>
  );
}
