# Demo Scenarios

Use only synthetic customers, messages, and account details when running demos.

## Normal Smart Lock Issue

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
- The subject is related to smart lock support.
- The response gives battery troubleshooting guidance.
- The conversation history displays the customer message and demo AI response.

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

Expected future behavior:

- Triage should flag an escalation condition.
- The case should move toward human handoff.
- A workflow can notify an agent.

Current behavior:

- Linea stores the message and returns the demo smart lock response.

## Overheating Safety Escalation

Customer email:

```text
maya.chen@example.com
```

Message:

```text
The smart lock is overheating and smells strange near the battery compartment.
```

Expected future behavior:

- Triage should flag a safety escalation.
- The response should avoid routine troubleshooting and route to a human.
- n8n can trigger an urgent workflow.

Current behavior:

- Linea stores the message and returns the demo smart lock response.

## Camera Offline

Customer email:

```text
arjun.mehta@example.com
```

Message:

```text
My camera has been offline since yesterday and I cannot reconnect it to Wi-Fi.
```

Expected future behavior:

- Triage should identify the camera product area.
- RAG should retrieve camera troubleshooting content when available.

Current behavior:

- Linea may create a camera-related subject, but the response is still the smart lock demo response.

## Human Handoff Request

Customer email:

```text
maya.chen@example.com
```

Message:

```text
Please connect me with a human support agent.
```

Expected future behavior:

- Triage should flag a handoff request.
- The case should show a human handoff state in the agent dashboard.

Current behavior:

- Linea stores the message and returns the demo AI response.

## Post-Sales Onboarding Blocker

Customer email:

```text
new.admin@example.com
```

Message:

```text
We cannot finish onboarding because our team invites are not being delivered.
```

Expected future behavior:

- The post-sales account layer should connect the case to onboarding status.
- Triage should identify an onboarding blocker.
- The dashboard should surface account risk.

Current behavior:

- Linea creates a synthetic customer and case, then returns the demo AI response.

## Go-Live API Setup Blocker

Customer email:

```text
new.admin@example.com
```

Message:

```text
Our API setup is still blocked and we are supposed to go live Friday.
```

Expected future behavior:

- Creates or updates a case.
- Identifies an onboarding blocker.
- Creates a CSM follow-up task.
- Logs a product signal.
- Marks the account at-risk.

Current behavior:

- Linea creates or restores a case, stores the message, and returns the demo AI response.
