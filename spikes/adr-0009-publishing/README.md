# ADR 0009 publishing proof

Retained non-production proof for
[ADR 0009](../../docs/adr/0009-repository-backed-visual-publishing.md).
Results belong in [evidence](../../knowledge/evidence/adr-0009-publishing.md).
This is not a supported publishing application or a real customer case study.

## Run from the repository root

Use the pinned Bun 1.2.23 and Node 24.20.0 (the verified rendering version).
The first Remotion render downloads Chrome Headless Shell and requires network
access. Subsequent rendering is local; no provider API key is needed.

```sh
bun install --frozen-lockfile
bun run check:ci
bun run spike:adr-0009:render
bun run spike:adr-0009:build
bun run spike:adr-0009:verify
bun run spike:adr-0009:preview
```

Open `http://127.0.0.1:4321/drawloom/`. Astro 7 backgrounds preview when running
under an agent. Stop it with `bun run spike:adr-0009:preview stop`.
The preview command changes to the spike directory because Astro 7.3.1's
agent-background child otherwise resolves a relative `--root` twice.

To edit the animation visually:

```sh
bun run spike:adr-0009:studio
```

Open the URL printed by Studio (normally `http://localhost:3000`). The one
composition is 1280×720, 30fps, 540 frames (18 seconds). The poster exports frame
450 from that same composition. Generated media lives in ignored `public/media/`
and the generated site in ignored `dist/`. No generated binary is committed.

## Boundaries and checks

The spike imports article/animation sources from `publishing/workbench-example/`.
Nothing outside `spikes/` may import this code. Strict source checking and the
scoped visual-design lint join `check:ci`; actual rendering/build-output checks
run explicitly (and ran in the original proof deployment). Browser validation is separate
evidence, not a claim implied by a passing build.

Remotion 4.0.520 declares a global Bun `Timer` type, so this host-specific spike's
typecheck includes the existing Bun types rather than weakening library checks.
Its CLI also warns that the repository's Zod 4.5.4 differs from its preferred
4.4.3. This composition does not use Zod schemas or `@remotion/zod-types`; rendering
and Studio are tested without downgrading Drawloom's contract dependency.
That is a scoped compatibility observation, not a claim about Zod-backed forms.

## Public deployment retired

After accepting ADR 0009, the maintainer requested removal of the public example.
The [publishing workflow](../../.github/workflows/publishing.yml) now deploys only
the coming-soon page from `publishing/site/`, not this spike's `dist/` or media.
The commands above still reproduce the original proof locally. Historical run
links and screenshots remain in the evidence record.

```sh
gh workflow run publishing.yml --ref main
gh run list --workflow publishing.yml --limit 1
```

The placeholder target is `https://mafifi.github.io/drawloom/`. Deployment needs
GitHub Actions/Pages access; readers need only a browser. No Substack/YouTube
account, CMS, custom domain, tracking or cloud renderer is configured.
