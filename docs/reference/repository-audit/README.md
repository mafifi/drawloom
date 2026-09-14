# Drawloom: architecture audit and reading route

Status: review preparation, not a completed architecture audit. Public Drawloom
only; private workbench code and data remain in their own repository.

## Start here

1. Open the [Archify ownership map](../generated/repository-atlas/overview.html).
2. Use the [complete reading ledger](../generated/repository-atlas/index.md) to
   open family maps and every tracked file. Keep personal checkmarks in a copy:
   regeneration replaces this generated ledger.
3. Follow the route below, recording findings against exact file paths and the
   reviewed commit. A green test suite is not an architecture sign-off.

Rebuild from the repository root:

```sh
node scripts/repository-atlas.mjs /Users/afifim/Development/archify/archify/bin/archify.mjs
```

Archify is a local authoring tool, not a product dependency. Tested tool revision:
`c1443b31b496eebf4a68bf83151816c955ddb796`. Generated HTML, graph JSON and the
inventory stay ignored. Graph edges are package-manifest dependencies; absence
of an edge does not prove absence of runtime coupling. Source links and actual
code inspection are the next layer of proof.

The initial build delivered all 18 maps through Archify's standard schema/layout
checks. Automated browser inspection of the local HTML was blocked by the browser
URL policy, so visual inspection remains a manual review step. Desktop detail
maps show selected literal source imports rather than manifest edges.

## The reading plan

Read by ownership first, then follow complete user journeys. For each package:
README → exported schemas/interfaces → conformance → implementation → tests →
composition sites. Read a provider's tests alongside it, not in a separate final
pass. This makes the implementation's intended guarantees visible immediately.

| Pass | Start with | Question to resolve | Deliverable |
|---|---|---|---|
| 1. Constitution | [Architecture](../../../ARCHITECTURE.md), [ADR 0005](../../adr/0005-partition-agent-platform-capabilities.md), ADRs 0003–0008 and DESIGN.md | Which of the eleven logical capabilities are implemented, delegated, combined or intentionally absent? | Capability-to-code matrix; no requirement for eleven physical packages |
| 2. Contracts | Every contract-role package manifest and `src/index.ts`, then `conformance.ts` | Who owns each identity, fact, error, cancellation and authority decision? Can implementations actually be exchanged? | Contract/provider/conformance matrix with explicit gaps |
| 3. Execution | `packages/agent`, `tools`, `host`, `context` | Does context stay bounded, native continuity opaque, and approval separate from independent grants? | Trace send → provider → tool → result; denial, cancellation and uncertain outcomes |
| 4. Plugins and composition | `packages/plugins`, `workbench`, `desktop`; `apps/desktop/host` | Are extensions standard, clearly named and project-bound? Are providers selected only at composition roots? | Installation → activation → tool/MCP App lifecycle trace; cross-project and trust-boundary checks |
| 5. Durable work | `packages/orchestration`, `evaluation`, `knowledge` | Do evaluation and Nightloom reuse orchestration? Who reconciles interrupted work without repeating effects? | Restart/recovery trace plus a single-authority ledger for checkpoints and outcomes |
| 6. Data and privacy | `packages/observability`, SQLite providers, asset/file routes | Are display history, knowledge, context and telemetry genuinely distinct? What leaks or survives withdrawal/deletion? | Data lifecycle and permission matrix; record actual local-only/enterprise limits |
| 7. Presentation | `apps/desktop/src`, `packages/ui`, example MCP Apps | Is application logic outside leaf Views? Does each screen inform and enable, using shared controls? | UI state/ownership review and comparison to DESIGN.md |
| 8. Everything else | `scripts`, `.github`, `.agents`, publishing, spikes, docs, knowledge and root config | Do build outputs, stale claims, duplicate machinery or historical experiments obscure the supported product? | Complete reading ledger including binary/source assets; generated artifacts classified separately |
| 9. End-to-end challenge | All preceding traces | Does the composition preserve every boundary under interruption, offline providers, stale responses and two projects? | Focused regressions and ranked findings before any repair plan |

### Review protocol

- Work in small sessions: one contract plus provider, or one host journey.
- For each file mark **read**, **follow-up** or **not applicable with reason**;
  a diagram node is not evidence that its files were reviewed.
- Record each finding as: file/line, observed behavior, violated principle or
  contract, concrete consumer consequence, severity, proposed smallest fix and
  test that would demonstrate it. Distinguish defects from stylistic preference.
- Prioritise authority/data loss/repeated effects, then correctness/recovery,
  then coupling/replaceability, then naming and layout. Do not refactor while
  still establishing the baseline.
- After the reading pass, agree a bounded repair plan. Run targeted regressions
  after fixes and the canonical public gate before integrating them. Private
  consumer validation remains separately attributed and private.

## Initial leads, not audit conclusions

- The UI baseline is commit `8c4ec74`; subsequent cleanup `4b1dc58` removed
  forty generated survey HTML pages/reports, retaining their source specs.
  After cleanup, cloc reports 148,349 code lines across 1,220 recognised text
  files. The broader reading inventory includes all tracked files and counts
  blanks/comments too: these are deliberately different measurements.
- The introductory “current state” prose in README/ARCHITECTURE describes early
  foundation progress alongside later implemented capabilities. Reconcile these
  statements with code and accepted ADRs during the documentation pass.
- Inspect the desktop host application and ViewModel early: they coordinate many
  capabilities. Size alone is not a defect; duplicated ownership or rules would be.
- A manifest dependency map cannot prove clean dynamic plugin boundaries,
  permission checks, browser message handling or provider substitution. Those
  require the traces and conformance inspection above.

## Completion criteria

Every tracked file is accounted for; every logical capability has a named owner
or an explicit delegated/deferred status; every provider has identified shared
conformance evidence; every critical journey has an authority and recovery trace.
Findings have reproducible evidence and an agreed disposition. Only then decide
whether the architecture is ready to present publicly—not because diagrams look
clean or the automated gate passes.
