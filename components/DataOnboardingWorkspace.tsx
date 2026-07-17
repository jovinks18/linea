"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Panel } from "./Panel";
import { StatusPill } from "./StatusPill";
import { formatDisplayLabel } from "../lib/ui/labels";

type Profile = {
  file: string;
  entity_guess: string;
  columns: string[];
  row_count: number;
  sample_rows: Record<string, string>[];
  required_field_warnings: string[];
};

type ProfileResponse = {
  mode: "sample" | "upload";
  source: string;
  profiles: Profile[];
  warnings: Record<string, unknown>[];
  validation_errors: Record<string, unknown>[];
};

type MappingEntity = {
  file: string;
  fields: Record<string, string>;
  metadata: Record<string, string>;
  confidence: number;
  needs_review: string[];
};

type MappingResponse = {
  mode: "sample" | "upload";
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
  mode: "sample" | "upload";
  dry_run: boolean;
  database_writes?: number;
  summary: ImportSummary;
  suggested_test_email: string | null;
};

type PendingAction =
  | "profile"
  | "upload"
  | "mapping"
  | "dry-run"
  | "import"
  | null;
type SourceMode = "sample" | "upload";
type UploadEntity =
  | "accounts"
  | "contacts"
  | "implementation_steps"
  | "cases";

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

const uploadFields: {
  entity: UploadEntity;
  label: string;
  description: string;
  required: boolean;
}[] = [
  {
    entity: "accounts",
    label: "Accounts CSV",
    description: "Companies, plans, lifecycle, health, and custom KPIs",
    required: true,
  },
  {
    entity: "contacts",
    label: "Contacts CSV",
    description: "Customer identities and account relationships",
    required: true,
  },
  {
    entity: "implementation_steps",
    label: "Implementation steps CSV",
    description: "Optional onboarding milestones and owners",
    required: false,
  },
  {
    entity: "cases",
    label: "Cases CSV",
    description: "Optional support cases and first messages",
    required: false,
  },
];

const emptyUploads: Record<UploadEntity, File | null> = {
  accounts: null,
  contacts: null,
  implementation_steps: null,
  cases: null,
};

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
  const uploadSessionId = useRef<string | null>(null);
  const [step, setStep] = useState(1);
  const [maxStep, setMaxStep] = useState(1);
  const [sourceMode, setSourceMode] =
    useState<SourceMode>("sample");
  const [uploadedFiles, setUploadedFiles] =
    useState<Record<UploadEntity, File | null>>(emptyUploads);
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

  function resetWorkflow(mode: SourceMode) {
    setSourceMode(mode);
    setStep(1);
    setMaxStep(1);
    setProfile(null);
    setMapping(null);
    setDryRun(null);
    setImportResult(null);
    setError("");
  }

  function getUploadSessionId() {
    if (uploadSessionId.current) return uploadSessionId.current;

    const stored = window.sessionStorage.getItem(
      "linea-data-upload-session"
    );
    uploadSessionId.current = stored || window.crypto.randomUUID();
    window.sessionStorage.setItem(
      "linea-data-upload-session",
      uploadSessionId.current
    );

    return uploadSessionId.current;
  }

  function beginUploadSession() {
    const sessionId = window.crypto.randomUUID();
    uploadSessionId.current = sessionId;
    window.sessionStorage.setItem(
      "linea-data-upload-session",
      sessionId
    );
    return sessionId;
  }

  function getDatasetRequestBody() {
    return {
      mode: sourceMode,
      session_id:
        sourceMode === "upload" ? getUploadSessionId() : null,
    };
  }

  function selectUploadFile(
    entity: UploadEntity,
    file: File | null
  ) {
    setError("");

    if (file && !file.name.toLowerCase().endsWith(".csv")) {
      setError(`${file.name} must be a CSV file.`);
      setUploadedFiles((current) => ({
        ...current,
        [entity]: null,
      }));
      return;
    }

    setUploadedFiles((current) => ({ ...current, [entity]: file }));
  }

  async function profileData() {
    let result: ProfileResponse | null;

    if (sourceMode === "upload") {
      if (!uploadedFiles.accounts || !uploadedFiles.contacts) {
        setError(
          "Accounts CSV and Contacts CSV are required before profiling."
        );
        return;
      }

      const formData = new FormData();
      formData.append("session_id", beginUploadSession());
      for (const field of uploadFields) {
        const file = uploadedFiles[field.entity];
        if (file) formData.append(field.entity, file);
      }

      result = await requestJson<ProfileResponse>(
        "/api/data/upload",
        "upload",
        { method: "POST", body: formData }
      );
    } else {
      result = await requestJson<ProfileResponse>(
        "/api/data/profile",
        "profile"
      );
    }

    if (!result) return;
    setProfile(result);
    advance(2);
  }

  async function recommendMapping() {
    const query =
      sourceMode === "upload"
        ? `?mode=upload&session_id=${encodeURIComponent(
            getUploadSessionId()
          )}`
        : "";
    const result = await requestJson<MappingResponse>(
      `/api/data/recommend-mapping${query}`,
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
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(getDatasetRequestBody()),
      }
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
        body: JSON.stringify({
          confirm: true,
          ...getDatasetRequestBody(),
        }),
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
          <StatusPill variant="info">
            {sourceMode === "sample"
              ? "Sample dataset mode"
              : "Uploaded CSV mode"}
          </StatusPill>
        </div>
        <h1 className="mt-3 text-3xl font-semibold text-[var(--text-primary)] sm:text-4xl">
          Prepare customer context for Linea
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--text-muted)] sm:text-base">
          Profile, map, validate, and import customer data through a supervised
          workflow. Nothing writes to PostgreSQL until the final confirmed
          import.
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
        {pending ? `${formatDisplayLabel(pending)} in progress` : ""}
      </div>

      {step === 1 && (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <Panel eyebrow="Step 1" title="Select a data source">
            <div className="grid grid-cols-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-2)] p-1">
              {[
                { mode: "sample" as const, label: "Use sample templates" },
                { mode: "upload" as const, label: "Upload my own CSVs" },
              ].map((option) => (
                <button
                  key={option.mode}
                  type="button"
                  aria-pressed={sourceMode === option.mode}
                  onClick={() => resetWorkflow(option.mode)}
                  className={`rounded-md px-3 py-2.5 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40 ${
                    sourceMode === option.mode
                      ? "bg-[var(--surface-1)] text-[var(--text-primary)] shadow-sm"
                      : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>

            {sourceMode === "sample" ? (
              <>
                <div className="mt-5 rounded-lg border border-dashed border-[var(--border-strong)] bg-[var(--surface-2)] p-6 text-center sm:p-8">
                  <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg border border-[var(--border-strong)] bg-[var(--surface-1)] font-mono text-xs font-semibold text-[var(--text-secondary)]">
                    CSV
                  </span>
                  <h2 className="mt-4 text-lg font-semibold text-[var(--text-primary)]">
                    Local template bundle selected
                  </h2>
                  <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-[var(--text-muted)]">
                    Use the checked-in synthetic templates to explore the full
                    workflow without providing your own files.
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
              </>
            ) : (
              <div className="mt-5 rounded-lg border border-dashed border-[var(--border-strong)] bg-[var(--surface-2)] p-4 sm:p-6">
                <div className="text-center">
                  <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg border border-[var(--border-strong)] bg-[var(--surface-1)] font-mono text-xs font-semibold text-[var(--text-secondary)]">
                    CSV
                  </span>
                  <h2 className="mt-4 text-lg font-semibold text-[var(--text-primary)]">
                    Choose local CSV files
                  </h2>
                  <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-[var(--text-muted)]">
                    Accounts and contacts are required. Files are isolated in
                    temporary local storage and expire automatically. Use
                    synthetic data only in this local workspace.
                  </p>
                </div>

                <div className="mt-6 grid gap-3">
                  {uploadFields.map((field) => {
                    const file = uploadedFiles[field.entity];

                    return (
                      <label
                        key={field.entity}
                        className="grid gap-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-1)] p-4 sm:grid-cols-[minmax(0,1fr)_minmax(12rem,0.8fr)] sm:items-center"
                      >
                        <span>
                          <span className="flex items-center gap-2 text-sm font-medium text-[var(--text-primary)]">
                            {field.label}
                            <StatusPill
                              variant={field.required ? "warning" : "muted"}
                            >
                              {field.required ? "Required" : "Optional"}
                            </StatusPill>
                          </span>
                          <span className="mt-1 block text-xs leading-5 text-[var(--text-subtle)]">
                            {field.description}
                          </span>
                        </span>
                        <span>
                          <input
                            type="file"
                            accept=".csv,text/csv"
                            onChange={(event) =>
                              selectUploadFile(
                                field.entity,
                                event.target.files?.[0] ?? null
                              )
                            }
                            className="block w-full text-xs text-[var(--text-muted)] file:mr-3 file:rounded-md file:border file:border-[var(--border-strong)] file:bg-[var(--surface-2)] file:px-3 file:py-2 file:text-xs file:font-medium file:text-[var(--text-secondary)] hover:file:border-[var(--accent)]"
                          />
                          {file && (
                            <span className="mt-2 block truncate font-mono text-xs text-[var(--status-green-text)]">
                              {file.name}
                            </span>
                          )}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="mt-6 flex justify-end">
              <ActionButton
                disabled={pending !== null}
                onClick={profileData}
              >
                {pending === "profile" || pending === "upload"
                  ? sourceMode === "sample"
                    ? "Profiling templates..."
                    : "Uploading and profiling..."
                  : sourceMode === "sample"
                    ? "Profile sample data"
                    : "Upload and profile data"}
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
                "This workspace accepts synthetic data only",
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
          action={
            <StatusPill variant="success">
              {profile.profiles.length} files detected
            </StatusPill>
          }
        >
          {(profile.warnings.length > 0 ||
            profile.validation_errors.length > 0) && (
            <div className="mb-5 grid gap-4 lg:grid-cols-2">
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-[0.14em] text-[var(--text-subtle)]">
                  Profile warnings
                </p>
                <IssueList
                  issues={profile.warnings}
                  emptyLabel="No profile warnings detected."
                  variant="warning"
                />
              </div>
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-[0.14em] text-[var(--text-subtle)]">
                  Validation
                </p>
                <IssueList
                  issues={profile.validation_errors}
                  emptyLabel="Profile validation passed."
                  variant="danger"
                />
              </div>
            </div>
          )}
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
                      {formatDisplayLabel(item.entity_guess)}
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
            Model suggestions, when configured, are advisory only. The
            deterministic field mapping below remains authoritative for this
            import.
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
                        {formatDisplayLabel(entity)}
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
