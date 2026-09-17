# ADR 0029: Give plugins and workbenches their own Settings pages

- **Status:** Accepted
- **Date:** 2026-09-17
- **Decision owners:** Drawloom maintainers

## Context

An installed plugin may need setup before it can do useful work: download a
local model, choose an account or save preferences. A workbench also needs a
place for its own defaults. Neither should require an open conversation or a
working model simply to explain what is missing.

Drawloom currently binds custom views and the Workbench settings form to a
conversation and project. That is appropriate for working documents, but not
for installation-wide setup. The maintainer selected individual plugin and
workbench pages in the existing Settings navigation.

## Decision

Retain standard MCP Apps for custom settings presentation. Add a small,
Drawloom-owned registration and installation-scoped hosting boundary, rather
than importing packaged JavaScript into the parent application or inventing a
second browser protocol. Implementation and acceptance were authorised by the
maintainer on 17 September 2026 after the implementation and verification review.

Packages declare settings pages in `extensions["org.drawloom"]`. Each declaration
names a page, its plugin or owned workbench, its opening tool and the exact
app-visible tools that page may call. Drawloom resolves these names within the
installation. Unknown extensions remain ignored; malformed settings must not
disable unrelated standard skills or MCP tools.

Drawloom owns navigation, mounted-page identity, source checks, theme, connection
failure and teardown. Settings sessions are independent of conversation sessions:
they receive no project directory, transcript, model-context update or message
capability. They cannot use a caller-supplied installation identity to select
another owner's operations. Opening a page is not execution permission.

The package supplies a self-contained MCP App and validates its settings at the
server. A small setup server must work before an optional model/runtime is ready.
Starting the server requires the existing installation activation/trust decision;
merely inspecting an installed package does not execute it. Disabled or broken
packages remain visible with a host-owned explanation, not a fabricated ready page.

Configuration has one authoritative home per installation and owner. Saves must
validate values, preserve unrelated configuration and detect stale revisions.
Secrets do not return as ordinary settings data. Saved preferences are not grants,
voice consent, acceptance of work or permission to spend. Workbench defaults apply
to new work; they do not rewrite existing project selections.

Downloads are explicit operations with start, status and cancellation. Closing a
page does not cancel them or claim success. The installation owner retains their
identity and progress so reopening can recover their state. Setup verifies pinned
artifacts before publishing readiness. A server restart must report interrupted
work honestly; uncertain effects are never automatically repeated.

The isolated page owns its unsaved form state. Drawloom does not claim to detect
dirty fields inside it. Pages must preserve drafts or explain their save boundary;
a universal unsaved-change protocol is outside this decision.

This extends ADR 0018's placement and activation choices and ADR 0020's
project-scoped activation with a separate installation-settings lifetime. It does
not replace their project bindings, standard MCP Apps transport or tool authority.

## Alternatives considered

- **MCP Apps plus Settings registration — selected.** Source inspection found
  Rosalind's own settings resource and app-only opening tool. Placement uses
  OpenAI-specific metadata, so Drawloom supplies its own namespaced declaration;
  no first-party OpenAI bridge is adopted.
- **Load components directly into Drawloom — considered, not implemented.**
  DeepSeek's settings sections demonstrate feature-owned presentation and scoped
  configuration, but its client loader executes modules in the parent document.
  That wider trust boundary is unnecessary for this consumer need.
- **Generate every form from a schema — considered, not implemented.** Useful for
  simple fields, but insufficient on its own for model progress, voice inspection
  and recovery. Schemas still validate operations; they do not dictate all UI.
- **Keep setup in the episode viewer — rejected by the maintainer.** It hides
  shared installation state behind project work and duplicates setup controls.

## Evidence

The [evidence record](../../knowledge/evidence/adr-0029-plugin-settings.md) separates
source inspection, product tests and installed-consumer verification. The linked
[reference comparison](../reference/plugin-settings.md) records inspected Rosalind
and DeepSeek versions, concrete source paths and Drawloom's starting gaps.
Source inspection is not a passing integration test. The
[delivery plan](../plans/0029-plugin-settings.md) tracks implementation and required
verification; no installation, isolation or recovery claim follows from this ADR
being present.

## Consequences

Authors can supply purpose-built settings pages without depending on Drawloom's
Svelte runtime. Shared components can be compiled into those pages. Drawloom must
test owner isolation, tool restrictions, absent models, page closure, concurrent
saves and installation shutdown, not only successful rendering.

The initial boundary is installation-wide settings. Project overrides, remote
provider installation, arbitrary host services, dynamic native component loading
and automatic package downloads are excluded. Public examples and tests use
generic consumers; private business settings and evidence stay private.
