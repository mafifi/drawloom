# Reviewed MPL-2.0 dependencies

The maintainer approved reviewed MPL-2.0 dependencies on 2026-09-14. MPL is
file-level copyleft, not a permissive licence. It permits combination with
Apache-licensed and proprietary code without relicensing independent files.
See [Mozilla's FAQ](https://www.mozilla.org/en-US/MPL/2.0/FAQ/), especially
questions 8–13, and the [licence](https://www.mozilla.org/en-US/MPL/2.0/).

## Reviewed versions

| Component | Source available to recipients | Decision |
| --- | --- | --- |
| lightningcss 1.33.0 and its locked 1.33.0 platform packages | [Upstream versioned source](https://github.com/parcel-bundler/lightningcss/tree/v1.33.0) | Allowed only with matching reviewed MPL text, including runtime distribution with the obligations below |
| option-ext 0.2.0 | [Exact published crate source](https://docs.rs/crate/option-ext/0.2.0/source/) | Allowed in the Tauri dependency graph |
| cssparser 0.36.0 | [Exact published crate source](https://docs.rs/crate/cssparser/0.36.0/source/) | Allowed; current graph reaches it through build/code generation |
| selectors 0.36.1 | [Exact published crate source](https://docs.rs/crate/selectors/0.36.1/source/) | Allowed; current graph reaches it through build/code generation |

Review inspected the installed version metadata and licence declarations against
the lockfiles. Lightning CSS's retained complete MPL text has SHA-256
`5eba353fe5076ac3432177f8ab1cf75e3afcd0584251e37c3bfead5f447d040e`.
The JavaScript gate binds admission to the exact platform names enumerated in
`scripts/license-policy.ts`, version 1.33.0 and that installed licence text. This
includes Linux CI without claiming that other-platform binaries were executed.
Other versions require an updated review; MPL is not a wildcard
exception for other copyleft licences. Cargo review is recorded here separately
and is not claimed to be enforced by the JavaScript gate.

## Distribution obligations

- Retain applicable copyright and licence notices, including the MPL licence.
- Tell recipients where to obtain the corresponding MPL-covered source. Include
  this source map in release notices and verify source availability for the exact
  shipped versions; archive corresponding source if necessary.
- Make any modifications to covered files available under MPL. No modifications
  to these dependencies are introduced by this review.
- Do not impose terms that restrict recipients' MPL source rights.
- Review actual shipped artifacts, including native packages, for further bundled
  components. This admission does not certify a complete release SBOM.

These are compliance tasks, not reasons to replace Tauri or Lightning CSS solely
because MPL appears in their dependency graphs. GPL/LGPL/AGPL and unknown/custom
licence decisions remain governed by the separate product policy.
