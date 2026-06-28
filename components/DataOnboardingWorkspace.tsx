"use client";

import Link from "next/link";
import { useState } from "react";
import { Panel } from "./Panel";
import { StatusPill } from "./StatusPill";

type Profile = {
  file: string;
  entity_guess: string;
  columns: string[];
  row_count: number;
  sample_rows: Record<string, string>[];
  required_field_warnings: string[];
};

type ProfileResponse = {
  mode: "sample";
  source: string;
  profiles: Profile[];
};

type MappingEntity = {
  file: string;
  fields: Record<string, string>;
  metadata: Record<string, string>;
  confidence: number;
  needs_review: string[];
};

type MappingResponse = {
  mode: "sample";
  source: string;
  recommendation: {
    generated_by: string;
    confidence: number;
    entities: Record<string, MappingEntity>;
    needs_review: string[];
    model_review?: {
      suggestions: {
        file: string;
        column: string;
        recommended_field: string;
        reason: string;
        confidence: number | null;
      }[];
      notes: string[];
    };
  };
};

type ImportSummary = {
  accounts_created: number;
  accounts_updated: number;
  contacts_created: number;
  contacts_updated: number;
  account_links_created: number;
  account_links_skipped: number;
  implementation_steps_created: number;
  implementation_steps_updated: number;
  cases_created: number;
  cases_skipped_as_duplicates: number;
  messages_created: number;
  warnings: Record<string, unknown>[];
  validation_errors: Record<string, unknown>[];
};

type ImportResponse = {
  mode: "sample";
  dry_run: boolean;
  database_writes?: number;
  summary: ImportSummary;
  suggested_test_email: string | null;
};

type PendingAction = "profile" | "mapping" | "dry-run" | "import" | null;

const steps = [
  { number: 1, label: "Source" },
  { number: 2, label: "Profile" },
  { number: 3, label: "Mapping" },
  { number: 4, label: "Dry run" },
  { number: 5, label: "Complete" },
] as const;

const sampleFiles = [
  { file: "accounts.csv", entity: "Accounts" },
  { file: "contacts.csv", entity: "Contacts" },
  { file: "implementation_steps.csv", entity: "Implementation steps" },
  { file: "cases.csv", entity: "Cases" },
];

const summaryFields: {
  key: keyof ImportSummary;
  label: string;
}[] = [
  { key: "accounts_created", label: "Accounts to create" },
  { key: "accounts_updated", label: "Accounts to update" },
  { key: "contacts_created", label: "Contacts to create" },
  { key: "contacts_updated", label: "Contacts to update" },
  { key: "account_links_created", label: "Links to create" },
  { key: "account_links_skipped", label: "Links to skip" },
  {
    key: "implementation_steps_created",
    label: "Steps to create",
  },
  {
    key: "implementation_steps_updated",
    label: "Steps to update",
  },
  { key: "cases_created", label: "Cases to create" },
  {
    key: "cases_skipped_as_duplicates",
    label: "Cases to skip",
  },
];

function formatLabel(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function issueText(issue: Record<string, unknown>) {
  for (const key of ["error", "warning", "message"]) {
    if (typeof issue[key] === "string") return issue[key];
  }

  return "Review this import item.";
}

function ActionButton({
  children,
  disabled,
  onClick,
  secondary = false,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  onClick: () => void;
  secondary?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded-lg border px-4 py-2.5 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40 disabled:cursor-not-allowed disabled:opacity-50 ${
        secondary
          ? "border-[var(--border-subtle)] bg-[var(--surface-2)] text-[var(--text-secondary)] hover:border-[var(--border-strong)]"
          : "border-[var(--accent)] bg-[var(--accent)] text-zinc-950 hover:brightness-110"
      }`}
    >
      {children}
    </button>
  );
}

function SummaryGrid({
  summary,
  completed = false,
}: {
  summary: ImportSummary;
  completed?: boolean;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {summaryFields.map((field) => (
        <div
          key={field.key}
          className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-2)] p-4"
        >
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-[var(--text-subtle)]">
            {completed
              ? field.label.replace("to create", "created").replace(
                  "to update",
                  "updated"
                )
              : field.label}
          </p>
          <p className="mt-3 text-2xl font-semibold text-[var(--text-primary)]">
            {summary[field.key] as number}
          </p>
        </div>
      ))}
    </div>
  );
}

function IssueList({
  issues,
  emptyLabel,
  variant,
}: {
  issues: Record<string, unknown>[];
  emptyLabel: string;
  variant: "success" | "warning" | "danger";
}) {
  if (issues.length === 0) {
    return (
      <div className="rounded-lg border border-[var(--status-green-border)] bg-[var(--status-green-bg)] p-4 text-sm text-[var(--status-green-text)]">
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className="grid gap-2">
      {issues.map((issue, index) => (
        <div
          key={`${issueText(issue)}-${index}`}
          className="flex items-start gap-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-2)] p-3"
        >
          <StatusPill variant={variant}>
            {variant === "danger" ? "Blocked" : "Review"}
          </StatusPill>
          <p className="pt-1 text-sm text-[var(--text-secondary)]">
            {issueText(issue)}
          </p>
        </div>
      ))}
    </div>
  );
}

export function DataOnboardingWorkspace() {
  const [step, setStep] = useState(1);
  const [maxStep, setMaxStep] = useState(1);
  const [pending, setPending] = useState<PendingAction>(null);
  const [error, setError] = useState("");
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [mapping, setMapping] = useState<MappingResponse | null>(null);
  const [dryRun, setDryRun] = useState<ImportResponse | null>(null);
  const [importResult, setImportResult] =
    useState<ImportResponse | null>(null);

  async function requestJson<T>(
    endpoint: string,
    action: Exclude<PendingAction, null>,
    init?: RequestInit
  ): Promise<T | null> {
    setPending(action);
    setError("");

    try {
      const response = await fetch(endpoint, init);
      const body = (await response.json()) as T & { error?: string };

      if (!response.ok) {
        throw new Error(body.error || "The request could not be completed.");
      }

      return body;
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "The request could not be completed."
      );
      return null;
    } finally {
      setPending(null);
    }
  }

  function advance(nextStep: number) {
    setStep(nextStep);
    setMaxStep((current) => Math.max(current, nextStep));
  }

  async function profileData() {
    const result = await requestJson<ProfileResponse>(
      "/api/data/profile",
      "profile"
    );
    if (!result) return;
    setProfile(result);
    advance(2);
  }

  async function recommendMapping() {
    const result = await requestJson<MappingResponse>(
      "/api/data/recommend-mapping",
      "mapping"
    );
    if (!result) return;
    setMapping(result);
    advance(3);
  }

  async function runDryRun() {
    const result = await requestJson<ImportResponse>(
      "/api/data/dry-run",
      "dry-run",
      { method: "POST" }
    );
    if (!result) return;
    setDryRun(result);
    advance(4);
  }

  async function importData() {
    const result = await requestJson<ImportResponse>(
      "/api/data/import",
      "import",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true, mode: "sample" }),
      }
    );
    if (!result) return;
    setImportResult(result);
    advance(5);
  }

  return (
    <div className="grid gap-7">
      <header>
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--text-subtle)]">
            Data onboarding
          </p>
          <StatusPill variant="info">Sample dataset mode</StatusPill>
        </div>
        <h1 className="mt-3 text-3xl font-semibold text-[var(--text-primary)] sm:text-4xl">
          Prepare customer context for Linea
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--text-muted)] sm:text-base">
          Profile, map, validate, and import the local CSV templates through a
          supervised workflow. Nothing writes to PostgreSQL until the final
          confirmed import.
        </p>
      </header>

      <nav aria-label="Data onboarding progress">
        <ol className="grid grid-cols-5 overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-1)]">
          {steps.map((item) => {
            const isActive = step === item.number;
            const isComplete = maxStep > item.number;
            const isAvailable = item.number <= maxStep;

            return (
              <li
                key={item.number}
                className="border-r border-[var(--border-subtle)] last:border-r-0"
              >
                <button
                  type="button"
                  disabled={!isAvailable}
                  onClick={() => setStep(item.number)}
                  aria-current={isActive ? "step" : undefined}
                  className={`flex min-h-20 w-full flex-col items-center justify-center gap-1 px-2 py-3 text-center transition focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[var(--accent)]/40 disabled:cursor-not-allowed ${
                    isActive
                      ? "bg-[var(--accent-muted)] text-[var(--text-primary)]"
                      : "text-[var(--text-muted)] hover:bg-[var(--surface-2)]"
                  }`}
                >
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-full border text-xs font-semibold ${
                      isComplete
                        ? "border-[var(--status-green-border)] bg-[var(--status-green-bg)] text-[var(--status-green-text)]"
                        : "border-[var(--border-strong)]"
                    }`}
                  >
                    {isComplete ? "\u2713" : item.number}
                  </span>
                  <span className="text-[10px] font-medium sm:text-xs">
                    {item.label}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-[var(--status-red-border)] bg-[var(--status-red-bg)] p-4 text-sm text-[var(--status-red-text)]"
        >
          <p className="font-medium">Workflow could not continue</p>
          <p className="mt-1">{error}</p>
        </div>
      )}

      <div aria-live="polite" className="sr-only">
        {pending ? `${formatLabel(pending)} in progress` : ""}
      </div>

      {step === 1 && (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <Panel eyebrow="Step 1" title="Select a data source">
            <div className="rounded-lg border border-dashed border-[var(--border-strong)] bg-[var(--surface-2)] p-6 text-center sm:p-8">
              <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg border border-[var(--border-strong)] bg-[var(--surface-1)] font-mono text-xs font-semibold text-[var(--text-secondary)]">
                CSV
              </span>
              <h2 className="mt-4 text-lg font-semibold text-[var(--text-primary)]">
                Local template bundle selected
              </h2>
              <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-[var(--text-muted)]">
                This first browser workflow uses the checked-in synthetic
                templates. Arbitrary file upload persistence is intentionally
                not enabled yet.
              </p>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {sampleFiles.map((item) => (
                <div
                  key={item.file}
                  className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-2)] p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate font-mono text-xs text-[var(--text-secondary)]">
                      {item.file}
                    </p>
                    <p className="mt-1 text-xs text-[var(--text-subtle)]">
                      {item.entity}
                    </p>
                  </div>
                  <StatusPill variant="success">Ready</StatusPill>
                </div>
              ))}
            </div>

            <div className="mt-6 flex justify-end">
              <ActionButton
                disabled={pending !== null}
                onClick={profileData}
              >
                {pending === "profile"
                  ? "Profiling templates..."
                  : "Profile sample data"}
              </ActionButton>
            </div>
          </Panel>

          <Panel eyebrow="Trust boundary" title="Safe by design">
            <div className="grid gap-4">
              {[
                "Model suggestions are review-only",
                "Importer writes through deterministic code",
                "Unknown fields are preserved as metadata",
                "No external connector writeback",
                "Imports are idempotent",
              ].map((item) => (
                <div key={item} className="flex items-start gap-3">
                  <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-[var(--status-green-border)] bg-[var(--status-green-bg)] text-xs text-[var(--status-green-text)]">
                    {"\u2713"}
                  </span>
                  <p className="text-sm leading-6 text-[var(--text-secondary)]">
                    {item}
                  </p>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      )}

      {step === 2 && profile && (
        <Panel
          eyebrow="Step 2"
          title="Profile detected data"
          action={<StatusPill variant="success">4 files detected</StatusPill>}
        >
          <div className="grid gap-4 lg:grid-cols-2">
            {profile.profiles.map((item) => (
              <article
                key={item.file}
                className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-2)] p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-mono text-sm text-[var(--text-primary)]">
                      {item.file}
                    </p>
                    <p className="mt-1 text-xs text-[var(--text-subtle)]">
                      {formatLabel(item.entity_guess)}
                    </p>
                  </div>
                  <StatusPill variant="info">
                    {item.row_count} rows
                  </StatusPill>
                </div>

                <p className="mt-4 text-xs font-medium uppercase tracking-[0.14em] text-[var(--text-subtle)]">
                  Detected columns
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {item.columns.map((column) => (
                    <span
                      key={column}
                      className="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-1)] px-2 py-1 font-mono text-xs text-[var(--text-secondary)]"
                    >
                      {column}
                    </span>
                  ))}
                </div>

                {item.required_field_warnings.length > 0 && (
                  <div className="mt-4">
                    {item.required_field_warnings.map((warning) => (
                      <p
                        key={warning}
                        className="text-xs text-[var(--status-amber-text)]"
                      >
                        {warning}
                      </p>
                    ))}
                  </div>
                )}

                <details className="mt-4 border-t border-[var(--border-subtle)] pt-3">
                  <summary className="cursor-pointer text-sm font-medium text-[var(--text-muted)]">
                    Inspect sample rows
                  </summary>
                  <div className="mt-3 grid gap-2">
                    {item.sample_rows.slice(0, 2).map((row, index) => (
                      <div
                        key={index}
                        className="rounded-md bg-[var(--surface-1)] p-3 text-xs"
                      >
                        {Object.entries(row).slice(0, 4).map(([key, value]) => (
                          <div
                            key={key}
                            className="grid grid-cols-[7rem_minmax(0,1fr)] gap-2 py-1"
                          >
                            <span className="truncate text-[var(--text-subtle)]">
                              {key}
                            </span>
                            <span className="truncate text-[var(--text-secondary)]">
                              {value || "Empty"}
                            </span>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </details>
              </article>
            ))}
          </div>

          <div className="mt-6 flex flex-wrap justify-between gap-3">
            <ActionButton secondary onClick={() => setStep(1)}>
              Back to source
            </ActionButton>
            <ActionButton
              disabled={pending !== null}
              onClick={recommendMapping}
            >
              {pending === "mapping"
                ? "Building recommendation..."
                : "Review recommended mapping"}
            </ActionButton>
          </div>
        </Panel>
      )}

      {step === 3 && mapping && (
        <Panel
          eyebrow="Step 3"
          title="Review canonical mapping"
          action={
            <StatusPill variant="info">
              {Math.round(mapping.recommendation.confidence * 100)}% overall
              confidence
            </StatusPill>
          }
        >
          <div className="mb-5 rounded-lg border border-[var(--status-blue-border)] bg-[var(--status-blue-bg)] p-4 text-sm leading-6 text-[var(--status-blue-text)]">
            Model suggestions, when configured, are advisory only. The sample
            import uses the reviewed mapping checked into the repository.
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            {Object.entries(mapping.recommendation.entities).map(
              ([entity, entityMapping]) => (
                <article
                  key={entity}
                  className="overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-2)]"
                >
                  <div className="flex items-center justify-between gap-3 border-b border-[var(--border-subtle)] px-4 py-3">
                    <div>
                      <p className="font-medium text-[var(--text-primary)]">
                        {formatLabel(entity)}
                      </p>
                      <p className="mt-1 font-mono text-xs text-[var(--text-subtle)]">
                        {entityMapping.file}
                      </p>
                    </div>
                    <StatusPill
                      variant={
                        entityMapping.needs_review.length
                          ? "warning"
                          : "success"
                      }
                    >
                      {Math.round(entityMapping.confidence * 100)}%
                    </StatusPill>
                  </div>

                  <div className="divide-y divide-[var(--border-subtle)]">
                    {Object.entries(entityMapping.fields).map(
                      ([source, canonical]) => (
                        <div
                          key={source}
                          className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3 px-4 py-3 text-sm"
                        >
                          <div>
                            <p className="text-xs text-[var(--text-subtle)]">
                              Linea field
                            </p>
                            <p className="mt-1 font-medium text-[var(--text-primary)]">
                              {canonical}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-[var(--text-subtle)]">
                              Source column
                            </p>
                            <p className="mt-1 font-mono text-[var(--text-secondary)]">
                              {source}
                            </p>
                          </div>
                        </div>
                      )
                    )}
                    {Object.entries(entityMapping.metadata).map(
                      ([source, metadataKey]) => (
                        <div
                          key={source}
                          className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3 bg-[var(--status-amber-bg)] px-4 py-3 text-sm"
                        >
                          <div>
                            <p className="text-xs text-[var(--status-amber-text)]">
                              Metadata field
                            </p>
                            <p className="mt-1 font-medium text-[var(--text-primary)]">
                              {metadataKey}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-[var(--text-subtle)]">
                              Source column
                            </p>
                            <p className="mt-1 font-mono text-[var(--text-secondary)]">
                              {source}
                            </p>
                          </div>
                        </div>
                      )
                    )}
                  </div>
                </article>
              )
            )}
          </div>

          {(mapping.recommendation.needs_review.length > 0 ||
            mapping.recommendation.model_review) && (
            <details className="mt-5 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-2)] p-4">
              <summary className="cursor-pointer text-sm font-medium text-[var(--text-secondary)]">
                Review advisory notes
              </summary>
              <div className="mt-3 grid gap-2 text-sm text-[var(--text-muted)]">
                {mapping.recommendation.needs_review.map((note) => (
                  <p key={note}>{note}</p>
                ))}
                {mapping.recommendation.model_review?.notes.map((note) => (
                  <p key={note}>Model note: {note}</p>
                ))}
              </div>
            </details>
          )}

          <div className="mt-6 flex flex-wrap justify-between gap-3">
            <ActionButton secondary onClick={() => setStep(2)}>
              Back to profile
            </ActionButton>
            <ActionButton
              disabled={pending !== null}
              onClick={runDryRun}
            >
              {pending === "dry-run"
                ? "Checking PostgreSQL..."
                : "Run dry-run preview"}
            </ActionButton>
          </div>
        </Panel>
      )}

      {step === 4 && dryRun && (
        <Panel
          eyebrow="Step 4"
          title="Confirm deterministic import plan"
          action={<StatusPill variant="success">0 database writes</StatusPill>}
        >
          <SummaryGrid summary={dryRun.summary} />

          <div className="mt-6 grid gap-5 lg:grid-cols-2">
            <div>
              <p className="mb-3 text-xs font-medium uppercase tracking-[0.14em] text-[var(--text-subtle)]">
                Warnings
              </p>
              <IssueList
                issues={dryRun.summary.warnings}
                emptyLabel="No import warnings detected."
                variant="warning"
              />
            </div>
            <div>
              <p className="mb-3 text-xs font-medium uppercase tracking-[0.14em] text-[var(--text-subtle)]">
                Validation
              </p>
              <IssueList
                issues={dryRun.summary.validation_errors}
                emptyLabel="Validation passed. The reviewed plan is ready."
                variant="danger"
              />
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border-subtle)] pt-5">
            <div>
              <p className="text-sm font-medium text-[var(--text-primary)]">
                Ready to write through the deterministic importer
              </p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                Repeated imports reconcile existing records and skip duplicate
                links and cases.
              </p>
            </div>
            <div className="flex gap-3">
              <ActionButton secondary onClick={() => setStep(3)}>
                Review mapping
              </ActionButton>
              <ActionButton
                disabled={
                  pending !== null ||
                  dryRun.summary.validation_errors.length > 0
                }
                onClick={importData}
              >
                {pending === "import"
                  ? "Importing sample data..."
                  : "Confirm and import"}
              </ActionButton>
            </div>
          </div>
        </Panel>
      )}

      {step === 5 && importResult && (
        <Panel
          eyebrow="Step 5"
          title="Import complete"
          action={<StatusPill variant="success">Committed</StatusPill>}
        >
          <div className="rounded-lg border border-[var(--status-green-border)] bg-[var(--status-green-bg)] p-5">
            <p className="text-lg font-semibold text-[var(--status-green-text)]">
              Customer context is ready for supervision
            </p>
            <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
              Valid records were reconciled inside one transaction. Existing
              records were updated and duplicate relationships were skipped.
            </p>
          </div>

          <div className="mt-5">
            <SummaryGrid summary={importResult.summary} completed />
          </div>

          {importResult.suggested_test_email && (
            <div className="mt-5 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-2)] p-4">
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-[var(--text-subtle)]">
                Suggested intake test
              </p>
              <p className="mt-2 font-mono text-sm text-[var(--text-primary)]">
                {importResult.suggested_test_email}
              </p>
            </div>
          )}

          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/dashboard"
              className="rounded-lg border border-[var(--accent)] bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-zinc-950 transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
            >
              Open Command Center
            </Link>
            <Link
              href="/chat"
              className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-2)] px-4 py-2.5 text-sm font-medium text-[var(--text-secondary)] transition hover:border-[var(--border-strong)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
            >
              Test in Chat Intake
            </Link>
          </div>
        </Panel>
      )}
    </div>
  );
}
