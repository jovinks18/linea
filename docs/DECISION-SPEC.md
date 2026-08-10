# Linea Decision Spec

**Status:** living document. This is the authority for how a case should be
labeled and handled. Golden cases are *derived from* this spec, not the other
way around. When a golden case disagrees with this spec, the case is wrong (or
the spec needs an explicit, dated amendment).

**How to use it:** to label any message, walk the four decision points in order.
Each has a decidable rule. If a real message can't be resolved by these rules,
the spec is underspecified — add a clause, don't guess case-by-case.

**What is standard vs. what is Linea's design:**
- Categories, priority, and escalation triggers follow standard CS/support
  triage practice.
- How those map into Linea's autonomy tiers, review gating, and account-health
  model is Linea's own design.

---

## Decision Point 1 — Classification

Assign exactly one classification. The test is the **state the message
describes**, never the vocabulary it contains.

| Class | Rule | Not this if… |
|---|---|---|
| `implementation_blocker` | Describes a **currently blocked state that stops onboarding/go-live progress** for the customer. | The message only *mentions* go-live/API/launch but nothing is presently blocked (a question about sequencing, a future plan, a completed step). |
| `support_question` | A functional problem, how-to, or device/product issue that is **not** blocking onboarding progress. | It's actually blocking go-live (→ blocker), or it's a product gap request (→ feedback). |
| `product_feedback` | A feature request, missing capability, or documentation gap routed to Product. | It's a broken existing feature (→ support_question or complaint). |
| `unknown` | Negative/complaint sentiment with **no clear actionable technical category** (vague frustration, a complaint that isn't a specific bug or blocker). | A specific technical issue is named (→ support_question). |

**The blocked-state test, applied to known edge cases:**
- "Please do not update health yet; we only need owner details." → **not a
  blocker.** Customer is declining action; this is a `support_question`/request.
- "Planning go-live next quarter." → **not a blocker.** Future planning →
  `support_question` (informational), priority P3.
- "We are angry about pricing, but nothing is blocked." → **not a blocker.**
  Negation of the keyword; `unknown` (complaint, no technical category).
- "Can you help me understand whether go-live requires the gateway first?" →
  **not a blocker.** Informational question → `support_question`.
- "Thanks, the setup went great." → **no action.** Positive, no request.
  Intent should reflect this (not `question`).

---

## Decision Point 2 — Priority (standard impact matrix)

Priority is set by **impact**, independent of classification.

| Priority | Meaning |
|---|---|
| `P1` | Blocked, down, or affecting many users/locations; go-live at imminent risk; SLA breach imminent. |
| `P2` | Degraded or single-user/single-location; a workaround exists; not time-critical. |
| `P3` | Minor, cosmetic, informational, or future-dated (no current impact). |

**Applied:**
- "We cannot launch until…" → launch-blocking → **P1** (not P2).
- "Planning next quarter." → no current impact → **P3**.
- Single device offline with workaround → **P2**.

---

## Decision Point 3 — Human review (uncertainty OR stakes)

Review is required when **either** condition holds. This is Linea's design; the
*stakes list* is the standard escalation set.

**A. Uncertainty**
- Account is unknown / unverified. (No account-level mutation is permitted; the
  case is created and held for a human.)
- Classification confidence is low / ambiguous (model cannot act safely).

**B. Stakes** — any of the standard escalation triggers, **regardless of
confidence or verification**:
- Account health would move to `at_risk` (see Decision Point 4).
- SLA breach imminent or occurred.
- Service outage / degraded service affecting many users or locations.
- Security, privacy, compliance, or data-loss concern.
- Billing / payment / invoice dispute.
- Cancellation / churn / renewal-risk signal.
- VIP / high-value account explicitly affected.

**Semantics (Linea design):** the stakes check is evaluated as its own step and
**overrides the autonomy tier**. A confident, verified, otherwise-bounded action
is still held for review if it trips a stakes trigger. Stakes wins over tier.

`require_human_review` is policy-exempt: it is the safe fallback, never itself
guard-checked, and is audited with the real trigger reason (e.g.
`unknown_account_requires_review`, `health_downgrade_requires_review`), never
`out_of_bounds`.

---

## Decision Point 4 — Account health mutation

`update_account_health` and `create_account_health_event` are permitted only for
**linked accounts** and only when a genuine blocker or risk condition is present.

**The at_risk transition is high-stakes by design:**
- Moving an account **to** `at_risk` requires human review (Decision Point 3B).
- This requirement is **floored**: the gates may not auto-promote the
  health-to-at_risk action into silent auto-execution, regardless of scorecard
  evidence. Evidence can tune lower-stakes actions; it cannot erode this gate.

**Known edge cases:**
- Already-`at_risk` account with a new blocker → health event may log, but no
  new *downgrade transition* occurs, so the at_risk-review floor is about the
  transition, not the state.
- Blocker on a `healthy`/`watch` account → this **is** a downgrade transition →
  requires review.

---

## Coverage the golden set must include (from standard triage categories)

The golden set is a **seed**, not exhaustive. It must at minimum cover, and grow
via operator corrections:
- Healthy/watch account → blocker → downgrade-to-at_risk transition (currently a
  blind spot).
- Cancellation / churn / renewal-risk signal.
- Service outage affecting many users.
- SLA breach / executive escalation language.
- Security / compliance / billing concern.
- Positive / no-action message.
- P3 / future-dated / informational message.
- Each of the four Decision-Point-1 edge cases above.

---

## Amendment log

Record every change to the rules here, dated, so the spec stays a defensible
history rather than a silent rewrite.

- (seed) Initial spec. Classification uses the blocked-state test. Review is
  uncertainty-OR-stakes with stakes overriding tier. Health-to-at_risk requires
  review and is floored against gate promotion.
