# Pre-publication cleanup and release qualification

Status: implementation authorized; release publication is not authorized.

The maintainer approved Biome, F5/F6 corrections, a narrow composition-root
refactor, removal of obsolete MLX setup declarations and release qualification.
The supplied [audit](pre-publication-audit.md) remains the original findings;
append closeout notes instead of rewriting observations. Start at `48eceb3` in
the existing public checkout. Preserve private repositories and historical data.

## Global constraints

- No new product behavior, protocol or learning subsystem redesign.
- Preserve role-derived dependency rules, authorization rechecks, denial before
  existence checks, consent, fixed project bindings, uncertain-effect recovery
  and current release limitations. Providers stay selected in composition roots.
- Use Biome as the requested formatter; pin and review its exact development
  dependency. Formatting must not change behavior or rewrite retained evidence,
  accepted ADR text, licence texts, vendored files or generated outputs.
- Preserve Claude's untracked audit; do not silently commit somebody else's
  wording as verified fact. Append scoped, source-backed closeout notes.
- Keep formatting mechanically separate from ownership/refactor/document changes.
  No push, public runtime publication, signing-identity creation or private changes.
- No live Codex calls: previous live allowances are exhausted. Local approved
  GGUF files may be reused without downloads. Tests must own disposable storage
  and processes; preserve results and remove only explicitly owned resources.
- One canonical gate after semantic changes; focused verification per slice.
  Do not run heavy benchmarks concurrently with the final gate. A failed run
  must be investigated and retained, never masked by relaxing assertions.

## Task 1: Adopt Biome and establish a formatting baseline

Inspect current official Biome language support and pin an exact permitted
development version in the root catalog. Add formatting configuration,
`format` and `check:format` commands, and include the latter in `check:ci`.
Use two spaces, LF, a consistent quote style, semicolons and a reasonable line
width. Disable unrelated autofixes/import reordering/lint enforcement for this
mechanical pass. Document commands, coverage and exclusions in CONTRIBUTING.

Cover supported product/application/script/config sources. Exclude raw research,
historical evidence, generated reports, third-party and licence texts. Do not
pretend Biome formats unsupported languages. Investigate Svelte/Astro support
on representative actual files before enabling experimental formatting; verify
compiler acceptance and preserved content/behavior, particularly template
whitespace. If unsafe or unsupported, explicitly document the limitation rather
than silently rewrite templates or add another formatter without discussion.

Write failing checks for config/CI coverage, verify formatting is idempotent,
and check parser/compiler output and fixtures for behavioral changes. Refresh
development dependency review records through existing tooling. Produce a frozen
diff and report, ready for a separate mechanical commit after review. Do not
commit until the controller has inspected the exact scope.

## Task 2: Correct capability ownership and decompose application wiring

Move `OrchestrationReadinessSchema` and its type into the orchestration contract,
then re-export from desktop-host to preserve existing exports. Test schema
identity/semantics and consuming-provider use; remove the Temporal provider's
desktop-host dependency when no longer used. Do not turn readiness into run
execution permission or add new host lifecycle abstractions.

Extract cohesive existing knowledge, orchestration and evaluation/plugin wiring
from `createDesktopApplication` into narrowly named sibling modules where useful.
The root still chooses concrete implementations and owns application lifetime.
Do not merely wrap the entire state in a service locator or duplicate facts.
Preserve lazy construction, binding capture, shutdown ordering and handling of
unknown outcomes. Start with characterization tests of the moved responsibilities
and run the existing host/integration and shared conformance checks afterward.
Use current Biome formatting. Freeze a scoped review diff before further edits.

## Task 3: Correct documentation and obsolete setup metadata

Remove supported MLX/Python lock references in root metadata and current setup
guidance, replacing them with the actual pinned GGUF/runtime authorities. Never
delete historical investigations or old measured evidence. Verify affected
dependency guards still cover the real runtime path.
Update the supported staging test's obsolete Python/MLX fixture to the current
GGUF worker package; assert that separately installed models are not bundled.

Fix the broken observability evidence link by linking its historically correct
source or clearly marking a moved implementation; do not rewrite old observations
as current verification. Add a direct desktop setup link to README. Remove the
redundant generated-directory ignore entry. Inspect ADR 0011's implemented scope
against successor decisions and report/record its correct disposition; do not
accept an ADR solely because a package exists. Preserve historical ADR formatting.
Record why fibres/spools are not missing accepted functionality. Correct the
audit's implication that a JavaScript gate clears all native release obligations.
Check relative links, schema/export references and active setup instructions.

## Task 4: Qualify release artifacts and scale behavior

The release inventory found two packaging corrections: the runtime build inherits
the build machine's minimum macOS version, and Temporal staging copies native
bridges for every platform. Make the deployment target explicit and verify it
against the desktop's declared minimum; do not silently raise that minimum or
claim older-machine testing. Stage only the selected platform's Temporal bridge,
retaining required runtime files and legal notices. Cover these changes with
public fixtures and installed-runtime smoke tests. Keep new runtime candidate
hashes separate from approved installer pins until reviewed.

The maintainer has now approved macOS 14 as the minimum. Use that setting for
the app and runtime build; building on a newer Mac does not prove execution on
macOS 14.

Release review also found a policy decision that remains open: the desktop host
uses `bun build --compile`, and [Bun 1.2.23's own notice](https://github.com/oven-sh/bun/blob/bun-v1.2.23/LICENSE.md)
identifies statically linked LGPL components. Bun's MIT licence alone does not
cover that bundled code. The current Drawloom policy excludes LGPL; the reviewed
MPL allowance does not change this. Do not waive the policy or replace the host
architecture without the maintainer's decision. GGUF runtime qualification is
independent and can continue. Neither a passing JavaScript licence check nor a
successful native build clears this distribution question.

Read ADR 0026 and retained stress evidence, current benchmark runners, runtime
archive manifest/build patch, licence inventory and macOS distribution setup.
First record exactly what is verified versus what requires external credentials,
publication, another machine or approval. Keep implementation acceptance distinct
from release readiness. Run the outstanding 100,000-record test using existing
approved GGUF weights in isolated, resumable storage with monitored process,
memory and disk use. Establish a bounded execution plan before starting; report
unfinished indexing honestly rather than relabeling authoritative record count.
Retain 10,000-record p95 target and separate indexing, startup and warm search.
Do not tune frozen cases or invoke GPL code.

Build and inspect the actual supported desktop/runtime artifacts, provenance,
bundled dependencies, notices and reviewed MPL source obligations. Verify local
fresh-install/setup/fallback and recovery with disposable data where possible.
Inspect signing/notarization prerequisites read-only; never claim a local
ad-hoc build is a distributable signed/notarized release. Do not publish an
archive or create public URLs. Explicitly report external blockers and give
reproducible next steps. Keep all new evidence separate from historical records.

## Task 5: Final review and handoff

Review non-format changes independently. Run canonical `bun run check:ci`,
relevant conformance and UI/dependency guards, and release-specific checks.
Update each audit finding's disposition without erasing original wording.
Keep formatting in a mechanical commit; other changes remain separate. Report
verified changes, precise test results and any still-open release prerequisites.
No automatic push or publication.
