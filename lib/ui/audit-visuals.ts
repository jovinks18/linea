const statusRowClasses: Record<string, string> = {
  executed: "audit-row--executed",
  suggested: "audit-row--suggested",
  skipped: "audit-row--skipped",
  failed: "audit-row--failed",
};

export function getAuditRowClassName({
  policyExempt,
  status,
}: {
  policyExempt: boolean;
  status: string;
}) {
  return [
    "audit-row",
    statusRowClasses[status] ?? "audit-row--skipped",
    policyExempt ? "audit-row--policy-exempt" : "",
  ]
    .filter(Boolean)
    .join(" ");
}

export function getAuditStatusPillClassName(status: string) {
  const width = status === "suggested" ? "min-w-24" : "min-w-20";

  return `${width} justify-center font-semibold shadow-sm`;
}
