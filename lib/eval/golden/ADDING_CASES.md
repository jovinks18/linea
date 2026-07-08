# Adding Golden Eval Cases

Linea's offline eval harness is meant to work with adopter-owned labeled
cases, not only the bundled synthetic seed set.

Add one or more `.json` files to a directory and pass that directory to:

```bash
node scripts/eval.mjs --dir path/to/golden-cases
```

Each file may contain either a single case object or an array of case objects.
Keep all data synthetic or approved for local evaluation.

## Required Shape

```json
{
  "input": {
    "channel": "web_chat",
    "message": "Customer message text",
    "account_context": {
      "account_id": 123,
      "customer_id": 456,
      "name": "Synthetic Account",
      "industry": "Healthcare",
      "plan": "Growth",
      "stage": "implementation",
      "health_status": "watch"
    }
  },
  "expected": {
    "intent": "question",
    "sentiment": "negative",
    "priority": "P1",
    "classification": "implementation_blocker",
    "recommended_actions": [
      "create_support_case",
      "detect_onboarding_blocker",
      "create_csm_task",
      "log_product_signal",
      "create_account_health_event",
      "update_account_health"
    ],
    "must_gate": false
  },
  "meta": {
    "id": "adopter-case-001",
    "source": "operator_correction",
    "labeled_by": "operator@example.invalid",
    "labeled_at": "2026-07-07T00:00:00.000Z"
  }
}
```

Use `account_context: null` when the customer is not linked to an account.
When an account is present, `account_context.account_id` is required because
the eval runner uses the real autonomy segment path:

```text
account_id present -> linked_account
account_context null -> unknown_account
```

## Labeling Guidance

- `recommended_actions` may include `create_support_case`, but action metrics
  exclude it because support-case capture is a policy-exempt intake prerequisite.
- `must_gate` means post-sales mutations must not auto-execute for this case.
  It does not apply to `create_support_case`.
- Include hard near-misses: ambiguous onboarding language, complaints that are
  not blockers, product feedback that looks operational, and support questions
  that mention launch timing without requiring account-level mutation.
- Keep labels stable and reviewable. If an operator corrects a case, preserve
  the correction source in `meta.source` and `meta.labeled_by`.
