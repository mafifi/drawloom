# Architecture decision records

ADRs record decisions that constrain future implementation.

Files use four-digit sequence numbers and kebab-case titles:

```text
0001-repository-foundations.md
```

Statuses are `Proposed`, `Accepted`, `Deprecated`, or `Superseded`. An accepted
ADR is not rewritten to reflect a later decision; a new ADR supersedes it and
links back.

## Latest decision

- [ADR 0010: Automatically deploy approved journal content](0010-automatically-deploy-approved-journal-content.md)
  is Accepted. Relevant pushes to `main` deploy the journal; draft content stays excluded.

- [ADR 0009: Keep visual publishing sources in the repository](0009-repository-backed-visual-publishing.md)
  is Accepted, with a retained static article and Remotion publishing proof.
  ADR 0010 amends its manual-only trigger after the author approved journal publication.

- [ADR 0008: Define tool execution and exposure](0008-tool-execution-and-exposure.md)
  is Accepted. Its working contract,
  deterministic conformance, and focused Codex MCP integration proof are recorded
  in the linked evidence; no supported implementation is introduced.
