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

- [ADR 0020: Directory-backed projects and efficient file delivery](0020-directory-backed-projects-and-file-delivery.md)
  is Accepted. Directory-backed projects, project-scoped activation, streamed file
  delivery and shared media origins are implemented and verified. Remote storage
  and cross-machine synchronization remain excluded.

- [ADR 0019: Useful observability through traces, logs and metrics](0019-useful-observability.md)
  is Accepted. Opt-in instrumentation, measured overhead and local diagnostic
  evidence establish the approach; discovery performance remains a separate fix.

- [ADR 0018: Plugin standards and Drawloom runtime extensions](0018-plugin-standards-and-runtime-extensions.md)
  is Accepted. Standard package loading and the bounded backend extension are
  implemented and proven with the migrated consumer. Native discovery latency
  remains a logging/instrumentation follow-up, not a resolved performance claim.

- [ADR 0017: Orchestration interfaces](0017-orchestration-interfaces.md) is
  Accepted. Typed workflow/run/agent boundaries are demonstrated by a retained
  local Temporal proof; no supported package or production backend is selected.

- [ADR 0016: Discoverable plugins, skills, tools and resources](0016-discoverable-contributions-and-resources.md)
  is Accepted. Registered contributions, native selections, attachments and
  standard tool resources are implemented; see its linked verification record.

- [ADR 0015: Keep working material with its owner and approve AI tool invocations](0015-working-material-ownership-and-edit-approval.md)
  is Accepted. It records lightweight provider files, plugin-owned editing and
  preservation, optional previews and native invocation-scoped AI review. The
  existing video plugin proved direct Save and Codex editing; [evidence and
  limitations](../reference/adr-0015-native-edit-review.md) distinguish live and
  simulated checks. ADR 0014's history guarantees are unchanged.

- [ADR 0014: Persistent, paginated conversation history](0014-persistent-paginated-conversation-history.md)
  is Accepted. The contract, local SQLite
  provider, incremental native ingestion and paginated desktop are delivered
  together; [verification evidence](../reference/conversation-history-evidence.md)
  records the conformance, recovery, browser and measurement checks.

- [ADR 0013: Define plugin contributions, dependencies and host integration](0013-plugin-boundaries-and-host-integration.md)
  is Accepted. Tools, skills, workbenches and UI share one plugin ownership model;
  the private video plugin proves standard MCP Apps and current-conversation
  assistance in the public host. Richer boundaries require a future ADR.

- [ADR 0012: Share UI components and guide their correct use](0012-shared-ui-components-and-guidance.md)
  is Accepted. Shared controls, stateful feedback and helpful checks have one
  public owner.

- [ADR 0011: Implement the foundation and trusted startup plugins](0011-supported-foundation-and-startup-plugins.md)
  is Proposed, with implementation authorised and review pending.

- [ADR 0010: Automatically deploy approved journal content](0010-automatically-deploy-approved-journal-content.md)
  is Accepted. Relevant pushes to `main` deploy the journal; draft content stays excluded.

- [ADR 0009: Keep visual publishing sources in the repository](0009-repository-backed-visual-publishing.md)
  is Accepted, with a retained static article and Remotion publishing proof.
  ADR 0010 amends its manual-only trigger after the author approved journal publication.

- [ADR 0008: Define tool execution and exposure](0008-tool-execution-and-exposure.md)
  is Accepted. Its working contract,
  deterministic conformance, and focused Codex MCP integration proof are recorded
  in the linked evidence; no supported implementation is introduced.
