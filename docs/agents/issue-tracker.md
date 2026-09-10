# Issue tracker: GitHub

Issues and specs for this repository live in GitHub Issues. Use the `gh` CLI
for operations after a remote has been created and authenticated.

## Conventions

- Create, read, comment on, label, and close issues with `gh issue`.
- Infer the repository from `git remote -v`.
- Pull requests are not a triage request surface.
- Specs produced by engineering skills are published as GitHub issues.

## Wayfinding operations

- A wayfinding map is one issue labelled `wayfinder:map`.
- Children use `wayfinder:<type>` labels and native GitHub dependencies where
  available; otherwise use explicit task-list and `Blocked by:` links.

