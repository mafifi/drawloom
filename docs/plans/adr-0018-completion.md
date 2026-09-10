# ADR 0018 completion

Status: completed; maintainer accepted ADR 0018 and authorised local commits on
2026-09-10. Results and limitations are linked from its evidence record. This
completed plan is retained as delivery history, not architecture authority.

## Binding outcome

Finish standard package loading and migrate the existing private video workbench
to an enhanced package. Public contracts/loading/UI stay here; private recipe,
plugins, fixtures and compiled Svelte UI stay in drawloom-workbenches. Standard
MCP Apps remains the only browser connection model. No new memory interface,
capability-provider registry, production orchestration backend or legacy bridge.

## Tasks

1. Amend extension contracts: required capabilities/tool/skill identities,
   optional tool/skill dependencies and startup availability report; direct
   backend contributions/controllers/servers/cleanup. Remove legacy composition.
   Scope JSON storage by installation. Keep grants/review authoritative.
2. Finish public discovery and OAuth: meaningful names/origins, app-only inventory
   without model exposure, preconfigured registration in desktop connection flow,
   credential isolation, standard form elicitation and restart-only replacement.
3. Finish standalone Veo authentication using Google's credential library and
   Application Default Credentials. No sign-in, model downloads or paid calls.
4. Migrate private workbench: independently installed reusable plugins, existing
   gateway calls, packaged recipe skills, standard MCP App, shared explicitly
   permitted working directory, optional-provider partial readiness. Remove
   duplicated Veo budget/recovery and treatment coupling in reusable packages.
5. Clean cutover: enumerate exact disposable runtime targets before reset, no
   legacy migration. Preserve useful source/tests/evidence, production systems,
   credentials and Codex data. Verify new-state durability after fresh install.
6. Verify generic MCP client, built artifacts outside checkouts, retained
   orchestration enhanced-package proof, real FFmpeg/scripted providers, live
   Codex approval/denial and direct Save, restart/cache behavior and both themes.
   Run both canonical gates and public guards. Update ADR/API/evidence together.

## Verification boundaries

Write and observe focused failing tests before each behavior change. Separate
live observations from simulations. Missing optional dependencies disable only
related operations; required dependencies disable enhancement, not standard
components. Inspection executes nothing; activation is not permission. Stop for
maintainer decision if standards or approved capability boundaries are inadequate.

## Delivery

The original delivery held changes uncommitted for review; the maintainer has
now authorised local commits. No publication, paid generation, global provider
changes or automatic credential setup. Exact resets and outcomes are recorded
in the evidence; the discovery latency remains an instrumentation follow-up.
