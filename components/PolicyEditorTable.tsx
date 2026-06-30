"use client";

import { Fragment, useState } from "react";
import { useRouter } from "next/navigation";
import {
  StatusPill,
  type StatusPillVariant,
} from "./StatusPill";

type AutonomyTier = "shadow" | "supervised" | "bounded" | "autonomous";

export type EditableAutonomyPolicy = {
  action_type: string;
  segment: string | null;
  tier: AutonomyTier;
  confidence_floor: number;
  max_blast_radius: number;
  requires_reversible: boolean;
  updated_by: string | null;
  updated_at: string;
};

type EditState = {
  key: string;
  policy: EditableAutonomyPolicy;
  tier: AutonomyTier;
  confidenceFloor: string;
  maxBlastRadius: string;
  requiresReversible: boolean;
  changedBy: string;
  changeReason: string;
};

function policyKey(policy: EditableAutonomyPolicy) {
  return `${policy.action_type}:${policy.segment ?? "default"}`;
}

function formatLabel(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatSegment(segment: string | null) {
  return segment === null ? "Default" : formatLabel(segment);
}

function tierVariant(tier: AutonomyTier): StatusPillVariant {
  if (tier === "shadow") return "muted";
  if (tier === "supervised") return "warning";
  if (tier === "bounded") return "info";
  return "success";
}

function createEditState(policy: EditableAutonomyPolicy): EditState {
  return {
    key: policyKey(policy),
    policy,
    tier: policy.tier,
    confidenceFloor: String(policy.confidence_floor),
    maxBlastRadius: String(policy.max_blast_radius),
    requiresReversible: policy.requires_reversible,
    changedBy: "",
    changeReason: "",
  };
}

export function PolicyEditorTable({
  policies,
}: {
  policies: EditableAutonomyPolicy[];
}) {
  const router = useRouter();
  const [editState, setEditState] = useState<EditState | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function startEditing(policy: EditableAutonomyPolicy) {
    setEditState(createEditState(policy));
    setErrors([]);
    setNotice(null);
  }

  function cancelEditing() {
    setEditState(null);
    setErrors([]);
  }

  async function savePolicy(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editState || saving) return;

    const patch: Record<string, unknown> = {};
    const confidenceFloor = Number(editState.confidenceFloor);
    const maxBlastRadius = Number(editState.maxBlastRadius);

    if (editState.tier !== editState.policy.tier) {
      patch.tier = editState.tier;
    }

    if (confidenceFloor !== editState.policy.confidence_floor) {
      patch.confidence_floor = confidenceFloor;
    }

    if (maxBlastRadius !== editState.policy.max_blast_radius) {
      patch.max_blast_radius = maxBlastRadius;
    }

    if (
      editState.requiresReversible !==
      editState.policy.requires_reversible
    ) {
      patch.requires_reversible = editState.requiresReversible;
    }

    setSaving(true);
    setErrors([]);
    setNotice(null);

    try {
      const response = await fetch("/api/admin/policies", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action_type: editState.policy.action_type,
          segment: editState.policy.segment,
          patch,
          changed_by: editState.changedBy,
          change_reason: editState.changeReason,
        }),
      });
      const result = (await response.json()) as {
        errors?: string[];
        mode?: "applied" | "pending_approval";
      };

      if (!response.ok) {
        setErrors(
          result.errors?.length
            ? result.errors
            : ["Policy update failed unexpectedly."]
        );
        return;
      }

      setEditState(null);
      setNotice(
        result.mode === "pending_approval"
          ? "Change request created and pending approval."
          : "Policy updated and audit record created."
      );
      router.refresh();
    } catch {
      setErrors(["Policy update could not reach the local server."]);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-4">
      {notice ? (
        <div
          role="status"
          className="rounded-lg border border-[var(--status-green-border)] bg-[var(--status-green-bg)] px-4 py-3 text-sm text-[var(--status-green-text)]"
        >
          {notice}
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-lg border border-[var(--border-subtle)]">
        <table className="w-full min-w-[1080px] border-collapse text-left">
          <thead className="bg-[var(--surface-3)]">
            <tr className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--text-subtle)]">
              <th scope="col" className="px-4 py-3">
                Action
              </th>
              <th scope="col" className="px-4 py-3">
                Segment
              </th>
              <th scope="col" className="px-4 py-3">
                Tier
              </th>
              <th scope="col" className="px-4 py-3">
                Confidence floor
              </th>
              <th scope="col" className="px-4 py-3">
                Max blast radius
              </th>
              <th scope="col" className="px-4 py-3">
                Requires reversible
              </th>
              <th scope="col" className="px-4 py-3">
                Updated by
              </th>
              <th scope="col" className="px-4 py-3">
                Updated at
              </th>
              <th scope="col" className="px-4 py-3">
                Manage
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-subtle)]">
            {policies.map((policy) => {
              const key = policyKey(policy);
              const isEditing = editState?.key === key;

              return (
                <Fragment key={key}>
                  <tr className="bg-[var(--surface-2)] text-sm text-[var(--text-secondary)]">
                    <th
                      scope="row"
                      className="px-4 py-4 font-mono text-xs font-medium text-[var(--text-primary)]"
                    >
                      {policy.action_type}
                    </th>
                    <td className="px-4 py-4">
                      {formatSegment(policy.segment)}
                    </td>
                    <td className="px-4 py-4">
                      <StatusPill variant={tierVariant(policy.tier)}>
                        {formatLabel(policy.tier)}
                      </StatusPill>
                    </td>
                    <td className="px-4 py-4">
                      {Math.round(policy.confidence_floor * 100)}%
                    </td>
                    <td className="px-4 py-4">
                      {policy.max_blast_radius}
                    </td>
                    <td className="px-4 py-4">
                      {policy.requires_reversible ? "Yes" : "No"}
                    </td>
                    <td className="px-4 py-4">
                      {policy.updated_by ?? "Not recorded"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 text-xs text-[var(--text-muted)]">
                      <time dateTime={policy.updated_at}>
                        {new Date(policy.updated_at).toLocaleString()}
                      </time>
                    </td>
                    <td className="px-4 py-4">
                      <button
                        type="button"
                        aria-expanded={isEditing}
                        onClick={() =>
                          isEditing ? cancelEditing() : startEditing(policy)
                        }
                        className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-3)] px-3 py-2 text-xs font-medium text-[var(--text-primary)] transition hover:border-[var(--border-strong)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
                      >
                        {isEditing ? "Close" : "Edit"}
                      </button>
                    </td>
                  </tr>

                  {isEditing && editState ? (
                    <tr className="bg-[var(--surface-1)]">
                      <td colSpan={9} className="p-4">
                        <form
                          noValidate
                          onSubmit={savePolicy}
                          className="grid gap-5 rounded-lg border border-[var(--border-strong)] bg-[var(--surface-2)] p-5"
                        >
                          <div>
                            <p className="text-xs font-medium uppercase tracking-[0.16em] text-[var(--text-subtle)]">
                              Controlled policy edit
                            </p>
                            <p className="mt-2 font-mono text-sm text-[var(--text-primary)]">
                              {policy.action_type} /{" "}
                              {formatSegment(policy.segment)}
                            </p>
                          </div>

                          {errors.length > 0 ? (
                            <div
                              role="alert"
                              className="rounded-lg border border-[var(--status-red-border)] bg-[var(--status-red-bg)] p-4"
                            >
                              <p className="font-medium text-[var(--status-red-text)]">
                                Policy update blocked
                              </p>
                              <ul className="mt-2 grid gap-1 text-sm text-[var(--status-red-text)]">
                                {errors.map((error) => (
                                  <li key={error}>{error}</li>
                                ))}
                              </ul>
                            </div>
                          ) : null}

                          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                            <label className="grid gap-2 text-sm text-[var(--text-secondary)]">
                              Tier
                              <select
                                value={editState.tier}
                                onChange={(event) =>
                                  setEditState({
                                    ...editState,
                                    tier: event.target.value as AutonomyTier,
                                  })
                                }
                                className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-1)] px-3 py-2 text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
                              >
                                <option value="shadow">Shadow</option>
                                <option value="supervised">Supervised</option>
                                <option value="bounded">Bounded</option>
                                <option value="autonomous" disabled>
                                  Autonomous
                                </option>
                              </select>
                              <span className="text-xs leading-5 text-[var(--text-subtle)]">
                                Autonomous upgrades are disabled in this
                                prototype.
                              </span>
                            </label>

                            <label className="grid gap-2 text-sm text-[var(--text-secondary)]">
                              Confidence floor
                              <input
                                type="number"
                                min="0.75"
                                max="1"
                                step="0.01"
                                value={editState.confidenceFloor}
                                onChange={(event) =>
                                  setEditState({
                                    ...editState,
                                    confidenceFloor: event.target.value,
                                  })
                                }
                                className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-1)] px-3 py-2 text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
                              />
                              <span className="text-xs leading-5 text-[var(--text-subtle)]">
                                Confidence floor must be 0.75-1.00.
                              </span>
                            </label>

                            <label className="grid gap-2 text-sm text-[var(--text-secondary)]">
                              Max blast radius
                              <input
                                type="number"
                                min="0"
                                max="1"
                                step="1"
                                value={editState.maxBlastRadius}
                                onChange={(event) =>
                                  setEditState({
                                    ...editState,
                                    maxBlastRadius: event.target.value,
                                  })
                                }
                                className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-1)] px-3 py-2 text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
                              />
                              <span className="text-xs leading-5 text-[var(--text-subtle)]">
                                Blast radius is capped at 1.
                              </span>
                            </label>

                            <label className="flex min-h-24 items-start gap-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-1)] p-3 text-sm text-[var(--text-secondary)]">
                              <input
                                type="checkbox"
                                checked={editState.requiresReversible}
                                onChange={(event) =>
                                  setEditState({
                                    ...editState,
                                    requiresReversible:
                                      event.target.checked,
                                  })
                                }
                                className="mt-1 h-4 w-4 accent-[var(--accent)]"
                              />
                              <span>
                                <span className="block text-[var(--text-primary)]">
                                  Requires reversible
                                </span>
                                <span className="mt-1 block text-xs leading-5 text-[var(--text-subtle)]">
                                  Non-reversible execution is only allowed for
                                  approved action/segment pairs.
                                </span>
                              </span>
                            </label>
                          </div>

                          <div className="grid gap-4 md:grid-cols-2">
                            <label className="grid gap-2 text-sm text-[var(--text-secondary)]">
                              Changed by
                              <input
                                type="text"
                                value={editState.changedBy}
                                onChange={(event) =>
                                  setEditState({
                                    ...editState,
                                    changedBy: event.target.value,
                                  })
                                }
                                placeholder="operator"
                                className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-1)] px-3 py-2 text-[var(--text-primary)] placeholder:text-[var(--text-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
                              />
                            </label>

                            <label className="grid gap-2 text-sm text-[var(--text-secondary)]">
                              Change reason
                              <textarea
                                rows={3}
                                value={editState.changeReason}
                                onChange={(event) =>
                                  setEditState({
                                    ...editState,
                                    changeReason: event.target.value,
                                  })
                                }
                                placeholder="Explain why this policy change is safe."
                                className="resize-y rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-1)] px-3 py-2 text-[var(--text-primary)] placeholder:text-[var(--text-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
                              />
                            </label>
                          </div>

                          <div className="flex flex-wrap justify-end gap-3">
                            <button
                              type="button"
                              onClick={cancelEditing}
                              disabled={saving}
                              className="rounded-lg border border-[var(--border-subtle)] px-4 py-2 text-sm font-medium text-[var(--text-secondary)] transition hover:bg-[var(--surface-3)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40 disabled:opacity-50"
                            >
                              Cancel
                            </button>
                            <button
                              type="submit"
                              disabled={saving}
                              className="rounded-lg border border-[var(--border-strong)] bg-[var(--accent-muted)] px-4 py-2 text-sm font-medium text-[var(--text-primary)] transition hover:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40 disabled:cursor-wait disabled:opacity-60"
                            >
                              {saving ? "Saving..." : "Save policy"}
                            </button>
                          </div>
                        </form>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
