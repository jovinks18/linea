# Linea Changes

## Supervision-First UI

- Added shared design tokens for surfaces, typography, borders, semantic status colors, and light/dark mode.
- Added a light mode toggle in the left rail using the same token system as dark mode.
- Reduced decorative accent color. Teal is now reserved for active or interactive elements.

## Chat Intake

- Simplified the result view around three operator questions: what the customer sent, what Linea understood, and what Linea did.
- Added a compact status bar with case ID, priority, sentiment, and human-review status.
- Made confidence prominent with a percentage and meter.
- Added a clear "Flag for human review / Override" affordance for every result.
- Kept technical agent details and conversation history available, but collapsed by default.
- Added explicit loading and error states for the intake workflow.

## Command Center

- Kept the four executive metric cards, with large values and subordinate context.
- Added priority, status, account, and sort controls for recent cases.
- Capped recent cases to five by default with a "View all" link.
- Applied semantic status colors consistently for priority, health, severity, and review states.
- Added intentional empty, loading, and error states.

## Case Title Integrity

- Fixed the triage subject bug where API blocker cases were titled "Smart lock support issue" because `blocked` contains `lock`.
- API/go-live blocker cases now use `Implementation Blocker - API go-live`.
- Added a zero-dependency regression test proving API blocker and smart-lock scenarios produce distinct case subjects.

## Response Copy Integrity

- Updated intake response routing so unknown-account blockers no longer claim account-level actions were executed.
- Known-account blockers still describe the CSM task, product signal, and health update.
- Unknown-account blockers now say Linea found no linked account, created a support case, and marked it for human review.
