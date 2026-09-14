---
type: evidence
id: canonical-domain-and-extensions
title: Canonical domain and plugin extension cutover
status: draft
created: 2026-09-14
updated: 2026-09-14
---

# Canonical domain and plugin extension cutover

The maintainer approved a complete naming replacement, not a compatibility
bridge. The [package reference](../../docs/reference/plugin-packages.md) owns
the resulting extension rules. Public changes belong here; private consumer
code, fixtures and detailed results remain in their private repository.
The naming follows [Agent Plugins 1.0.0 §8](https://agent-plugins.org/specification#8-client-extensions),
inspected on 2026-09-14: client-specific metadata and packaged files share a
reverse-domain namespace; unsupported namespaces remain uninterpreted.

## Approved boundaries

- `https://drawloom.org` is the current Drawloom-owned website and OAuth metadata
  origin. `org.drawloom` is the stable extension namespace even if the site moves.
- Drawloom-specific packaged modules reside under `org.drawloom/`. Portable
  skills, root MCP configuration, standard MCP Apps and existing grants do not
  gain a new protocol or permission.
- No namespace aliases, alternate directory lookup or credential-store bridge.
  Installed enhancements need current packaging through the existing update flow;
  unfinished-work protection still applies. The credential namespace is
  `org.drawloom.mcp-oauth`; fresh sign-in is required for a new identity. No old
  credentials are automatically read, migrated or deleted.
- Version 1 remains version 1. Published JSON Schema is generated from its
  contract-owned definition; loading never fetches a schema from the website.

## Local verification — 2026-09-14

Website/OAuth regression tests were first run failing against the former site
configuration, client identity and absent schema output. Root deployment,
canonical OAuth identity and schema emission then passed local tests. Production
and preview builds are tested separately; previews retain `noindex` and do not
claim canonical publication. Media copying uses the same root-relative paths as
the generated articles. These local checks do not prove deployed assets.

GitHub profile domain verification succeeded using the existing DNS TXT record.
The repository Pages API subsequently reported `protected_domain_state: verified`
and an approved certificate covering both root and `www`. HTTPS enforcement was
enabled and read back as `true`. Ordinary HTTPS requests returned root HTTP 200
and `www` HTTP 301 to `https://drawloom.org/`. This was the previously deployed
site, not yet the updated build.

The final `bun run check:ci` exited zero after all public package corrections:
1,035 Bun tests passed with eight opt-in skips; all Node suites also passed.
The packed-package checks passed (two tests, 73 assertions), including extraction
outside the source checkout under an ancestor named `src`. Review caught duplicate
extension executables and type declarations outside the namespace; packaging now
keeps both under `org.drawloom/`. Contract and activation checks cover containment,
unknown namespaces and invalid enhancements without disabling portable features.
The public package and website slices passed independent review.

Public commit `0a4113f` passed final integration review and was pushed. Private
consumer changes were independently reviewed and committed separately; their
scenario evidence and limitations remain private. The inspected running desktop had no installed
local packages to update; no installation, conversation, grant or user data was
changed to manufacture an upgrade observation.

The first [publishing run](https://github.com/mafifi/drawloom/actions/runs/34848167281)
stopped at the Linux licence gate, before rendering or deployment. The installed
`sqlite-vec-linux-x64@0.1.9` required an explicit MIT alternative selection, already
present for the macOS variant. The exact Linux metadata and upstream MIT licence
were reviewed; [the licence record](../../LICENSES/README.md) documents that
selection, with no policy-wide exemption. Its regression test failed before the
selection and passed afterwards. The full local gate passed again (1,036 Bun
tests, eight opt-in skips, and all Node suites). Linux Actions and deployed asset
verification are still pending; local success is not deployment success.

The second [publishing run](https://github.com/mafifi/drawloom/actions/runs/34848893772)
passed licensing but exposed five-second build/pack test timeouts and a
hardware-dependent setup fixture. The corrections retain assertions, give only
four build integrations bounded 60-second limits, and explicitly exercise both
Mac and Linux setup outcomes. All 29 targeted tests passed (172 assertions).

At the maintainer's request, publication now depends on CI instead of repeating
the complete gate. CI invokes the same-commit reusable publication workflow only
after success on `main`, for relevant changes or manual CI dispatch. Unrelated
changes skip publication; there is no independent publication dispatch. The
nine workflow/scope checks passed (27 assertions), including a real Git rename
out of the publishing directory that must remove the old published page. Rename
detection is disabled in path selection so both paths are considered. `actionlint` validated
both workflow files. This is local wiring verification, not yet an Actions result.

OAuth tests use controlled transport and a session credential store. The native
keychain service name was source-reviewed. An opt-in synthetic OS credential
round trip passed (one test, two assertions), deleting its UUID-scoped test record
afterwards. No live provider sign-in or credential migration was performed, and
existing user credential records were not touched. Native namespace isolation is
source-reviewed rather than tested by seeding credentials under a former name.

## Historical evidence

Current Markdown URLs and namespace spellings are normalized with explicit
amendment notes. Original observation dates and outcomes remain intact. Prior
successful browser/HTTP checks are not represented as tests of this deployment.
Git history and third-party legal texts are unchanged.

The [survey evidence organization](../../docs/reference/evidence/README.md) keeps
archived diagrams, receipts and screenshots together; fresh generated reports
remain ignored. The evaluation survey verifier passed for eight diagrams, 61
component sources, 96 pinned source links and 44 local links. This checks artifact
identity and source/link existence, not upstream behavior or model quality.
The knowledge survey verifier also passed: nine diagrams, 235 pinned source links,
119 unique source blobs and 70 local links. All 159 moved survey artifacts were
rechecked byte-for-byte against commit `8c4ec74`; no archived artifact changed.
