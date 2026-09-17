# Project collaboration

- Preserve existing user changes and local clinical source files.
- Never commit `.env`, credentials, patient workbooks, exported sessions, or private traces.
- The live workspace uses physician-authoritative review: internal rule findings belong in `/observation` and must not suppress its three candidates. Preserve temporal visibility and session integrity.
- Generated evidence must be explicitly synthetic and provenance-linked, and may only enter synthetic research sessions.
- After each completed task, run appropriate checks, commit the relevant source changes, and push to the configured GitHub remote (user preference, 2026-09-15). Report any push failure; never force-push to resolve it.
- Control verification time and usage (user preference, 2026-09-16): run checks proportionate to the change, stop expanding verification once required checks pass, and deliver promptly. Report unfinished optional checks explicitly instead of prolonging the task for full local indexing or repeated test/build cycles. State expected time and resource use before substantial additional validation. When the user requests immediate commit/push, stop further validation and submit the current state.
