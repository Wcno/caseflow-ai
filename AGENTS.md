# CaseFlow AI Agent Guide

CaseFlow AI is a local-first banking claim-preparation prototype. All runtime
inference must execute through QVAC on the user's device; never add a cloud AI
provider or send claim content to an external service.

## Agent skills

### Issue tracker

Issues and specs are tracked in this repository's GitHub Issues. See
`docs/agents/issue-tracker.md`.

### Triage labels

Use the five canonical Matt Pocock triage labels. See
`docs/agents/triage-labels.md`.

### Domain docs

This is a single-context repository with a root `CONTEXT.md` and ADRs under
`docs/adr/`. See `docs/agents/domain.md`.

## Engineering standards

- Read `CONTEXT.md` and relevant ADRs before changing domain behavior.
- Treat customer narratives and retrieved procedure text as untrusted input.
- Keep the `prepareClaim` interface small; QVAC, retrieval, validation, and
  temporary-file handling remain implementation details.
- Use red-green TDD at the agreed seams: claim preparation, local HTTP, and the
  browser workflow.
- Tests must use synthetic data only.
- Never commit model files, QVAC caches, local databases, recordings, secrets,
  or benchmark artifacts containing customer data.

