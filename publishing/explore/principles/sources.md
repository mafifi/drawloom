# Sources: Principles (step 1)

Verification notes for `page.md`. Not published.

## Intro and framing

- Ten principles guide the core, dependencies and developers' workbenches:
  ARCHITECTURE.md, "Decision principles" (lines 5-6); README.md "Principles".
- Order of principles: ARCHITECTURE.md lines 12-50.
- ADR 0006 recorded the original five; the ten are the maintainer's current
  grouping and priorities: ARCHITECTURE.md lines 56-58; ADR 0006 "Decision".

## Per principle

1. Safety definition: ARCHITECTURE.md item 1. Example: ADR 0023 "Decision" §1
   (Drawloom owns enforcement; organisation owns policy; "An agent, browser or
   arbitrary plugin cannot grant itself permission by supplying favourable
   attributes"); §4 ("Unknown identity or missing required authorization facts
   must not silently become permission"). Not-proof claim: ADR 0023 line 145
   ("proves neither full AuthZEN conformance nor NIST compliance"); NIST SP
   800-162 at line 23, AuthZEN in §2.
2. Familiarity definition: ARCHITECTURE.md item 2. Example: ADR 0015 "Approve
   the AI invocation, not a mandatory preview" (lines ~128-150): "ask me" /
   "approve for me", use the provider's native review path, "rather than ...
   building another reviewer", "Do not modify global Codex configuration".
   Components: ADR 0012 "Decision" (shadcn-svelte registry components).
   "Widely used" is editorial characterisation of shadcn-svelte; not a sourced
   statistic. ADR 0030 (Proposed) deliberately not cited.
3. Vendor agnostic: ARCHITECTURE.md item 3 (Codex currently the only supported
   integration, not a permanent requirement). Example: ADR 0007 "Hide provider
   continuity inside the adapter"; "without manufacturing parity" (Context);
   ADR 0006 principle 2 ("providers can differ honestly").
4. Open standards: ARCHITECTURE.md item 4. Example: ADR 0013 Context (MCP Apps
   chosen over in-process client modules) and lines ~146-147 ("Persist with
   standard MCP Apps until a concrete interaction proves it insufficient");
   ARCHITECTURE.md "Plugin responsibilities" ("not a custom browser protocol").
5. Freedom: ARCHITECTURE.md item 5; ADR 0026 "Permissive product
   dependencies" (transitive, runtimes, weights, reviewed MPL-2.0). GPL cost:
   ADR 0026 Context and Alternatives (mlx-embeddings 0.1.0 GPL-3.0-only;
   MLX-VLM pulled GPL-with-exception GCC runtime); ADR 0034 Alternatives
   ("refusal of a GPL-with-exception dependency, which cost a working MLX
   implementation"). Bun -> Node/pnpm: ADR 0034 Context (Bun runtime bundles
   LGPL JavaScriptCore/WebKit and LGPL-2.1 TinyCC; ADR 0026 excludes LGPL) and
   Decision (pnpm, Node).
6. Local offering: ARCHITECTURE.md item 6. Example: ADR 0034 Alternatives
   ("Requiring a user-installed Node ... breaks the accessible local start in
   Principle 6"); Decision (pinned Node runtime inside the application).
   Model download explicit from Settings, not bundled: ADR 0026 "Installation
   and transition".
7. Don't over engineer: ARCHITECTURE.md item 7. Example: ADR 0034 Decision
   ("No compatibility layer is written for either runtime"; "schema converters
   written for users who do not exist are deleted rather than ported").
8. Reuse: ARCHITECTURE.md item 8. Example: ADR 0021 Context ("Reusing Temporal
   avoids building another durable workflow engine"). Reference comparison:
   CONTRIBUTING.md "Reference-led changes and approval" step 1 (Rosalind and
   DeepSeek Harness), applying to plugin interfaces.
9. Resiliency & testing: ARCHITECTURE.md item 9. Conformance: ADR 0004 "One
   shared conformance suite ships with each contract"; CONTRIBUTING.md "Test
   the behaviour, not just the code". Node move: ADR 0034 Context (Bun cannot
   load `node:sqlite`; 47 tests broke; tests could not exercise shipping
   runtime) and Consequences ("Tests execute what ships").
10. Clear responsibility: ARCHITECTURE.md item 10. Example: ADR 0005 "Make
    orchestration the coordinator, not the owner of everything" ("does not
    absorb the contracts it coordinates"). Approval vs acceptance:
    ARCHITECTURE.md "Responsibilities and safeguards", "Permission is not
    acceptance"; ADR 0015.

## Four questions

- ARCHITECTURE.md lines 52-55 (problem observed, why simpler falls short, cost,
  how to test; "Saving code is not a good trade if it removes necessary
  protection or makes the product hard to use").
- ADR 0006 "Apply a decision test" (six questions).

## Conflicts between principles

- ADR 0006 "Make complexity earn its place" ("No single principle is a mandate
  to maximise its concern regardless of the others") and end of decision test
  ("If the principles conflict, the ADR or design records the trade-off").
- Temporal dev-only status accepted: ADR 0021 Decision ("explicitly accepts
  this local-v1 deployment despite Temporal's development-only support status.
  SQLite persistence does not establish production service guarantees").
  Note: ADR 0021 also says "Bun remains the repository toolchain"; that part is
  superseded by ADR 0034. Not repeated on the page.
- Node move trade-off: ADR 0034 Alternatives (user-installed Node).

## Links checked (all exist)

ARCHITECTURE.md, CONTRIBUTING.md, docs/adr/ (0004, 0005, 0006, 0007, 0012,
0013, 0015, 0021, 0023, 0026, 0034). Anchors `#decision-principles` and
`#reference-led-changes-and-approval` match headings.

## Left out / uncertain

- Did not claim any principle is formally ranked beyond the listed order.
- Did not describe Cedar/Casbin selection (ADR 0023 leaves it open).
