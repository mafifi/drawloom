# Dependency licence evidence

`inventory.json` is an explicitly exported compliance inventory of locked packages,
not a claim that every entry ships or has been cleared. `texts/` preserves captured
installed-product JavaScript legal files byte-for-byte, deduplicated by SHA256.
See [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md) for package-to-text mappings.

The gate's version-specific missing-metadata decisions are backed by hashes of
the installed upstream texts. Dual-licence selections are explicit. Attribution
does not waive unapproved copyleft or unknown terms under Drawloom's product policy.
Reviewed MPL-2.0 dependencies are permitted; exact admissions and source obligations
are in [MPL-REVIEW.md](MPL-REVIEW.md).

## Remaining review boundaries

The Linux CI package `sqlite-vec-linux-x64@0.1.9` explicitly selects MIT, matching
the reviewed macOS variant. Its [npm metadata](https://registry.npmjs.org/sqlite-vec-linux-x64/0.1.9)
declares `MIT OR Apache`; the [upstream v0.1.9 MIT text](https://github.com/asg017/sqlite-vec/blob/v0.1.9/LICENSE-MIT)
was inspected on 2026-09-14. This exact-version selection fixes a Linux-only gate
failure; it does not admit unreviewed platforms or waive native-binary attribution.

- Missing local legal files are listed, not replaced with guessed copyrights.
- Installed peer traversal also reaches MPL-2.0 `lightningcss@1.33.0` and its
  native package via `bits-ui -> runed -> @sveltejs/kit -> vite-plugin-svelte ->
  vitefu -> vite`. This conservative product-candidate path blocks the licence
  inventory; the maintainer now permits these reviewed versions under MPL-2.0.
  They no longer block admission, whether build-only or shipped. This graph is not
  proof that Lightning CSS is inside the desktop executable.
- Cargo lock entries include other targets, build dependencies and proc macros;
  the lockfile alone does not establish final-binary inclusion.
- The macOS-arm64 normal Cargo graph includes MPL-2.0 `option-ext` through
  `dirs-sys -> dirs -> tauri/wry`. Its reviewed version is allowed. Actual shipped
  source and notice obligations remain part of artifact review.
- MPL-2.0 cssparser/selectors also appear through Tauri's proc-macro/codegen path.
  Development/build-only review is distinct from runtime adoption.
- Runtime archives, models, copied UI source, embedded Node/Temporal binaries
  and native transitive components need their own exact-artifact licence payloads.
  The new llama.cpp archive must include its reviewed legal files.
- Dev-only Remotion/custom SDK terms and optional platform packages remain separate
  inventory findings. This change does not replace unrelated dependencies.

Do not describe this repository as comprehensively permissive or ready to ship
until these findings and final-artifact mappings have been reviewed.
