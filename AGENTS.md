<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Linea Project Instructions

Linea is an open-source AI post-sales support system. It manages synthetic customer support cases across channels with case memory, AI triage, RAG-ready responses, and human handoff.

## Data And Secrets

- All data must remain synthetic. Never add real customer names, emails, phone numbers, addresses, tickets, transcripts, credentials, or account details.
- Never commit `.env`, `.env.local`, secrets, tokens, API keys, OAuth credentials, webhooks with secrets, or real customer data.
- Use `.env.example` for documented placeholders only.

## Code Organization

- Keep API routes in `app/api`.
- Keep reusable server logic in `lib`.
- Keep knowledge-base demo content in `knowledge-base`.
- Keep project documentation in `docs`.
- Keep changes small, reviewable, and testable.

## Integration Boundaries

- Do not add Qdrant, n8n, Ollama, Gmail, Telegram, or other channel integrations unless the task explicitly asks for that integration.
- Qdrant and n8n may exist in Docker for future milestones, but app code should not depend on them until an integration task is approved.

## Workflow Expectations

- Before changing behavior, inspect the relevant code and docs first.
- Do not change database schema, API contracts, or the working `/chat` flow unless the task explicitly asks.
- After changes, always summarize changed files and provide manual test steps.
