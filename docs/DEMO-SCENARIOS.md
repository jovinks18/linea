# Demo Scenarios

Use only synthetic customers, messages, and account details when running demos.

## Golden Demo: Smart Lock Failure

Customer email:

```text
maya.chen@example.com
```

Message:

```text
My smart lock is not responding after I changed the batteries.
```

Expected current behavior:

- Linea creates or restores a case.
- Subject is `Smart lock support issue`.
- Sentiment is `negative`.
- Priority is `P1`.
- Acme Clinics account context is shown.
- The response gives smart lock battery troubleshooting guidance.
- No onboarding blocker actions are triggered unless blocker terms are present.
- The conversation history displays the customer message and demo AI response.

## Golden Demo: API Go-Live Blocker

Customer email:

```text
maya.chen@example.com
```

Message:

```text
Our API setup is still blocked and we are supposed to go live Friday.
```

Expected current behavior:

- Linea creates or restores a case.
- Sentiment is `negative`.
- Priority is `P1`.
- Acme Clinics account context is shown.
- Onboarding blocker is detected.
- CSM task is created or updated.
- Product signal is logged.
- Health event is created or updated.
- Acme Clinics account health is updated to `at_risk`.
- The latest response uses post-sales blocker language.

## Unknown Account Blocker

Customer email:

```text
unknown.blocker@example.com
```

Message:

```text
Our API setup is still blocked and we are supposed to go live Friday.
```

Expected current behavior:

- Linea creates a synthetic customer and case.
- Sentiment is `negative`.
- Priority is `P1`.
- `post_sales.account` is `null`.
- No post-sales actions are created.
- The UI shows `No linked account found.` and all actions as `Not triggered`.

## Same-Case Follow-Up

Customer email:

```text
maya.chen@example.com
```

Message:

```text
I tried the reset button and the lock still does not respond.
```

Expected current behavior:

- Use the existing case number from a previous demo.
- Linea appends the follow-up to the same case.
- The conversation timeline includes the earlier messages and the new pair of messages.

## Lockout Escalation

Customer email:

```text
sofia.garcia@example.com
```

Message:

```text
I am locked out and the smart lock will not open even after replacing the batteries.
```

Expected current behavior:

- Linea creates or restores a case.
- Sentiment is `negative`.
- Priority is `P1`.
- Bluebird Coworking account context is shown.
- The response is still deterministic demo guidance.

## Camera Offline

Customer email:

```text
arjun.mehta@example.com
```

Message:

```text
My camera has been offline since yesterday and I cannot reconnect it to Wi-Fi.
```

Expected current behavior:

- Linea creates or restores a case.
- Subject is camera-related.
- Northstar Apartments account context is shown.
- The response is still deterministic demo guidance until product-specific retrieval is added.

## Human Handoff Request

Customer email:

```text
maya.chen@example.com
```

Message:

```text
Please connect me with a human support agent.
```

Expected current behavior:

- Linea creates or restores a case.
- Intent is `request`.
- Account context is shown.
- No post-sales actions are triggered unless blocker terms are present.
