# Contributing

This guide takes you from planning a change to preparing it for review. Start
with the [README](README.md) to understand Drawloom and
[ARCHITECTURE.md](ARCHITECTURE.md) to understand how its parts fit together.

## Before you start

- **Understand the area you're changing.** Read its README and the related
  architecture decision records (ADRs). Check the root and nearest
  `AGENTS.md` too, whether you're writing the code yourself or using an agent.
- **Explain the change.** Identify the problem, the parts it affects and how
  you'll know it works. For work with several steps, keep a short plan in
  [docs/plans/](docs/plans/).
- **Agree changes to the design first.** If other code will need to call a
  component differently, agree that interface before implementing it. Record
  lasting architectural decisions in an ADR.
- **Build on what is already there.** Check whether an existing capability,
  library or standard can do the job before adding another implementation.

The sections below explain how to keep components replaceable, protect users'
work, test your changes and prepare a contribution.

## Keep components replaceable

An interface describes what a component accepts, what it returns and how it
should behave. Drawloom also calls this a **contract**. An implementation is the
code that does the work behind that interface.

- **Use the interface.** Code using a capability should not depend on the
  internals of one implementation. Choose the implementation when setting up
  the application, not throughout the code that uses it.
- **Keep shared interfaces independent.** A package defining an interface must
  not import the implementation it describes.
- **Separate code tied to a platform.** Keep Bun, Node.js, Cloudflare and Tauri
  APIs out of packages intended to work across platforms. Put those calls in
  a platform-specific implementation behind an interface.
- **Check incoming data before using it.** Use the validation rules defined
  alongside the interface to check data received from files, users, tools or
  other services. Do not assume it matches a TypeScript type simply because
  the code expects that type.
- **Let capabilities work together.** Evaluation already uses orchestration to
  schedule work; Nightloom uses it to coordinate knowledge maintenance. Reuse
  those capabilities rather than adding a second scheduler, approval system
  or general-purpose file store for one feature.

For the package layout and examples, see [packages/](packages/).

## Protect the user's work

The [responsibilities and safeguards](ARCHITECTURE.md#responsibilities-and-safeguards)
explain why these distinctions matter. When changing code, check the ones your
change touches:

- **Conversations:** Leave Codex in charge of its native session and conversation
  management. Drawloom's saved display history is a separate record, not a
  replacement for that session.
- **Projects:** Use the project attached to the conversation when accessing files
  or workbench state—not whichever project the user currently has selected.
  Viewing a file does not import it or give the agent more access.
- **Knowledge:** Keep SQLite records as the source of truth; search indexes
  can be rebuilt. Apply access decisions using verified identity and policy
  information, not labels or permissions supplied by a model or browser request.
- **Plugin editing:** Leave content checks, confidence assessments, saving and
  handling out-of-date edits to the plugin that owns the material. Do not impose
  one preview, undo or acceptance process on every plugin.
- **Remote media:** Use the host's shared rules for allowed media sources.
  Permission to load an image or video does not permit scripts, credential
  sharing or automatic storage. Changing those rules must not discard unsaved
  work.
- **Interrupted work:** Distinguish failure, denied permission, cancellation and
  an unknown outcome. If an action may already have changed something, do not
  automatically repeat it.
- **Results:** A successful tool call or a good evaluation score does not mean
  the user has accepted the work.

### Integrate tools without weakening permissions

Work with the user's configured tools when they are available and authorised.
Keep the platform's existing permissions, sandbox and review controls.
Drawloom tools also have their own access grants and execution records; native
approval does not replace those checks.

Check what can actually run. A tool appearing in a list does not prove it can
be called, or that its actions receive approval checks. If review is missing or
unsupported, explain the gap to the maintainer rather than bypassing it or
building a substitute reviewer.

AI edits need human or supported delegated review where the policy requires it.
Approval applies to the specific action and its unchanged arguments, within
existing permissions. It does not extend to different work.

Direct editing by a person in a plugin UI is separate from AI approval, but
still follows the host's access controls. Permission to edit does not authorise
paid generation or publication. See
[ADR 0015](docs/adr/0015-working-material-ownership-and-edit-approval.md) for the
details and tested limits.

## Reference-led changes and approval

Changes to plugin interfaces need a comparison with existing tools before
implementation. This helps us avoid inventing a new integration where an
established approach already works.

1. Compare the relevant behaviour in both OpenAI/Codex's Rosalind and DeepSeek
   Harness. Start with the
   [harness and workbench survey](docs/reference/harness-workbench-survey/README.md),
   checking which source versions were studied and what was actually observed.
2. Keep MCP Apps as the plugin UI connection and test with the existing video
   workbench in its own repository. A bug in Drawloom is not evidence that the
   standard needs replacing.
3. If the references differ or cannot meet the requirement, stop and ask the
   maintainer to choose an approach. Show the example, what you tried, how the
   reference tools behave and the smallest alternative, including safety and
   maintenance costs.
4. Record the approved choice in the ADR, update the interface and rerun the
   integration tests. Approval covers that change, not other changes alongside it.

[ADR 0013](docs/adr/0013-plugin-boundaries-and-host-integration.md) records this
requirement. Contributors without access to the private workbench should ask
the maintainer to arrange that integration check; public tests must remain
independent of it.

## Test the behaviour, not just the code

Every implementation of an interface runs the same shared tests. We call these
**conformance tests**: they check that implementations keep the same promises
even when the code underneath is different.

- **When an interface changes, update its shared tests.** Run them against every
  implementation, not just the one you changed.
- **Test the complete interaction.** Unit tests are useful, but also check the
  components working together through the application or integration your
  change affects.
- **Test when things go wrong.** Include invalid input, denied access,
  cancellation, failure and recovery where relevant.
- **Test the platforms you claim to support.** Passing under Bun does not prove
  that the same code works under Node.js, Cloudflare or Tauri.
- **Measure claimed improvements.** Record the workload, environment and results.
  Do not assume that a design is faster, safer or more useful because it looks
  better on paper.
- **Say what you tested.** Distinguish simulated responses from live integrations,
  and explain what remains untested. An accepted interface is not proof that
  every workload or production deployment has been verified.

For knowledge or retrieval changes, start with the
[knowledge and memory survey](docs/reference/knowledge-memory-survey/README.md)
and the evidence linked from the relevant ADR. Preserve known limitations when
reporting results, including the use of Temporal's local development server
rather than a production deployment.

### Format maintained source

Biome formats the maintained JavaScript, TypeScript, JSON and CSS sources in
the application, packages, evaluation runners, publishing application and
repository scripts. Run `bun run format` to update that baseline and
`bun run check:format` to verify it; the latter also runs in `check:ci`.

The baseline deliberately excludes raw research and historical evidence under
`docs/`, `knowledge/`, `spikes/` and `LICENSES/`; generated, vendored and fixture
files; hash-bound evaluation corpora and result JSON; retained publishing diagram
specifications; public artwork and licence text. Preserve those bytes through
their owning evidence or generation workflow.

Biome 2.5's full Svelte and Astro support is experimental. Testing against the
repository's templates changed parsed text nodes and compiler output, including
under strict whitespace sensitivity, so `.svelte` and `.astro` files are excluded
in full rather than formatting only their embedded scripts. Continue to use the
Svelte and Astro compiler checks for those files. Do not add or enable a second
template formatter without maintainer approval and an equivalent content check.

### Check documentation structure and links

`bun run check:docs` verifies that every architecture decision record uses the
house format from [the ADR template](docs/adr/0000-template.md) — Context,
Decision, Alternatives considered, Evidence, Consequences, with a recognised
status — and that every relative Markdown link in the repository resolves,
including its heading anchor. It runs in `check:ci`.

The check deliberately says nothing about prose. Line lengths and formatting
conventions measure Markdown source layout, not whether a reader understands the
document. Editorial quality stays with review.

Renaming a heading can break an incoming link from another document. The anchor
check exists to catch that.

## Keep research and documentation useful

Update the documentation affected by your change and keep its links working.
Explain what a reader needs to know, linking to existing explanations rather
than copying them into several places.

Keep experiments in `spikes/`. Code outside that directory must not import
them: an experiment is not a supported product dependency. Keep lasting findings
in [knowledge/](knowledge/), with sources, dates and enough detail to reproduce
the result. Preserve research evidence; an earlier investigation does not mean
its dependencies are approved for the product.

## Public and commercial boundary

Workbenches can use Drawloom's public interfaces from separate, privately
licensed repositories. The public core must work without them.

Everything committed here is public, including examples, tests and experiments.
A package's `private: true` flag prevents publishing it as a package; it does
not hide its source code.

- Keep business code, prompts, data and workbench-specific tests in their owning
  repository. The private `drawloom-workbenches` repository holds workbenches,
  not a private fork of the core.
- Keep public builds and tests runnable without private repositories,
  credentials, package access or services.
- Run the shared interface tests against private implementations too. Keep their
  additional business scenarios private.

### Decide what belongs in the core

Before proposing a shared interface, explain the general problem, why existing
tools cannot solve it, and how a different kind of workbench would use it.
Identify what stays with the workbench and what public tests will demonstrate.

You do not need to build a second workbench first, but you do need to challenge
assumptions specific to the first one. Giving a business rule a generic name
does not make it a core responsibility. Business approval rules, recipes and
domain records stay with their owners; enterprise services can build on the
core without making it depend on them.

### Enforcement and limits

Before work spans repositories, state where each change belongs and whether
that repository is public. Do not move another product's code without
authorisation. Copying private code, prompts, fixtures, data or assets here
requires explicit approval to publish them. Use made-up test data and reviewed
summaries; removing names alone does not make private material safe to publish.

Automated checks reject known private packages and detected imports outside the
checkout. Keep [the private-package list](scripts/public-boundary-policy.json)
current when adding a private namespace. A dependency-version exception cannot
override this rule.

The checks cannot catch every copied passage or file loaded at runtime. Review
the contribution yourself too. Previously approved journal material follows
the [editorial publication rules](publishing/EDITORIAL.md).

## Review dependency licences

We want people to be able to use and distribute Drawloom freely. Before adding
a library, model or runtime, check that its licence fits that goal. These rules
also apply to software it depends on and anything we ask users to download.

### Which licences can we use?

- **Permissive licences:** Use dependencies whose permissive licence has been
  reviewed and approved for Drawloom.
- **MPL-2.0:** We also allow this licence after review. Record the exact version,
  keep its required notices and explain how users can obtain the source code
  covered by MPL. If we change an MPL-covered file, those changes must remain
  under MPL too.
- **GPL, LGPL and AGPL:** Do not add these to the product or its required
  downloads. Our policy also excludes GPL licences with runtime exceptions and
  other unapproved copyleft licences.
- **A choice of licences:** Record which allowed licence we are using. Do not
  leave the choice implicit.
- **Unfamiliar or custom terms:** Ask the maintainer before adding the dependency.
  Bypassing an automated check is not licence approval.

### What should I check and record?

Read the licence for the version you are adding, including the software packaged
with it. A licence label on a package website is not enough. Check model weights
and the software running them separately.

Keep the required copyright statements, licence texts and notices. Update the
dependency inventory and attribution records together. Giving someone credit in
the acknowledgements does not replace these requirements.

Run `bun run check:licenses`, then inspect the actual runtime or archive we will
distribute. The automated JavaScript check cannot check every native component.
Report unresolved questions before describing a download as ready to distribute.

Tools used only for development receive a separate review. Do not let an
unapproved development dependency become part of the product or a required user
download. Keep historical research and publication evidence when replacing a
dependency; recording an investigation is not adopting the software it studied.

[ADR 0026](docs/adr/0026-permissive-dependencies-and-local-gguf-embeddings.md)
records the decision behind this policy.

## Prepare your contribution

Use the pinned dependencies and run the repository checks from its root:

```sh
bun install --frozen-lockfile
bun run check:ci
```

Keep external dependency versions in the root Bun catalog, referenced by
`catalog:` in workspace packages. Internal packages use `workspace:*`.
See the [dependency and package policy](docs/reference/dependency-policy.md).

Before submitting, explain what changed, why, how you tested it and any remaining
limitations. Check that the contribution contains no secrets, credentials,
private prompts or sensitive logs.

### Sign off your commits

Contributions use the [Developer Certificate of Origin 1.1](DCO). Sign off each
commit to confirm that you have the right to contribute the work under
Drawloom's Apache-2.0 licence:

```sh
git commit --signoff
```

This adds a `Signed-off-by` line to the commit. It is not a copyright assignment.
