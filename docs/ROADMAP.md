# Roadmap

This roadmap describes the planned open-source milestones for Linea. The current codebase is in the v0.1 phase.

## v0.1 Cleanup And Open-Source Readiness

- Replace starter project documentation with Linea documentation.
- Document local setup, demo scenarios, architecture, and roadmap.
- Add safe environment-variable examples.
- Keep all demo data synthetic.
- Clarify contribution and future-agent instructions.
- Preserve the current working `/chat` flow while the foundation is cleaned up.

## v0.2 Triage Engine

- Extract deterministic triage logic into reusable modules.
- Classify support intent, sentiment, priority, product area, and escalation flags.
- Store triage decisions as case metadata and case events.
- Add repeatable tests for common synthetic support scenarios.
- Keep model-based triage optional until the deterministic flow is reliable.

## v0.3 Agent Dashboard

- Add a dashboard for viewing and filtering cases.
- Add case detail pages with conversation history and timeline events.
- Support human handoff status, internal notes, and ownership fields.
- Add simple agent reply workflows.
- Prepare the UI for multi-channel cases without integrating new channels yet.

## v0.4 Post-Sales Account Layer

- Add synthetic accounts, products, subscriptions, onboarding status, and lifecycle stage.
- Link customers and cases to accounts.
- Track implementation steps and onboarding blockers.
- Create CSM follow-up tasks from customer conversations.
- Add account-level memory across related cases and tasks.

## v0.5 Product Signals And Account Health

- Convert conversations into product signals such as bugs, feature requests, integration gaps, documentation gaps, and usability friction.
- Connect product signals back to affected accounts and cases.
- Record account health events when issues affect go-live dates, adoption, renewal, security, or executive confidence.
- Surface at-risk accounts in the dashboard.
- Prepare structured outputs for product, support, customer success, and implementation teams.

## v0.6 Qdrant RAG And Workflow Integrations

- Index synthetic knowledge-base documents into Qdrant.
- Retrieve relevant support and implementation snippets during response generation.
- Store retrieval metadata with AI responses, cases, or account events.
- Trigger n8n workflows from events such as escalation, handoff, onboarding risk, account-health changes, and product signals.
- Add signed or secret-protected webhook endpoints.
- Keep all integrations disabled unless configured.
