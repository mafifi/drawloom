import { expect, test } from "vitest";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { articleMetadata } from "../publishing/site/src/article-metadata.ts";
import { DrawloomPackageExtensionJsonSchema } from "../packages/plugins/plugins/dist/package.js";
import { spawnSync } from "node:child_process";
import { text as readText } from "node:stream/consumers";
import { once } from "node:events";
import { spawn, type ChildProcess } from "node:child_process";
/** Node signals child completion with an "exit" event; there is no awaitable `exited`. */
const exitCodeOf = async (child: ChildProcess): Promise<number> =>
  (await once(child, "exit"))[0] as number;

const configInspection = spawnSync(process.execPath, [
  "--input-type=module",
  "-e",
  'import("./publishing/site/astro.config.mjs").then(({ default: config }) => console.log(JSON.stringify({ site: config.site, base: config.base, integrations: config.integrations?.map(({ name }) => name) })))',
]);
if (configInspection.status !== 0) throw new Error(configInspection.stderr.toString());
const journalConfig = JSON.parse(configInspection.stdout.toString());

test("publishing and OAuth share the canonical root domain", () => {
  expect(journalConfig.site).toBe("https://drawloom.org");
  expect(journalConfig.base).toBe("/");
  const metadata = JSON.parse(readFileSync("publishing/site/public/oauth/client.json", "utf8"));
  expect(metadata.client_id).toBe("https://drawloom.org/oauth/client.json");
  expect(metadata.client_uri).toBe("https://drawloom.org/");
});

test("article metadata defaults to private and validates publication and media boundaries", () => {
  const article = { title: "Title", description: "Description" };
  expect(articleMetadata.parse(article).draft).toBe(true);
  expect(articleMetadata.safeParse({ ...article, draft: false }).success).toBe(false);
  expect(
    articleMetadata.safeParse({ ...article, draft: false, published: "2026-09-05" }).success,
  ).toBe(true);
  expect(
    articleMetadata.safeParse({
      ...article,
      media: { video: "../private.mp4", poster: "still.png" },
    }).success,
  ).toBe(false);
  expect(articleMetadata.safeParse({ ...article, media: { video: "clip.mp4" } }).success).toBe(
    false,
  );
});

test("Archify source keeps the workbench outside all ten Drawloom capabilities", () => {
  const diagram = JSON.parse(
    readFileSync("publishing/a-place-to-do-the-work/diagrams/drawloom.architecture.json", "utf8"),
  ) as {
    components: { id: string }[];
    boundaries: { wraps: string[] }[];
    connections: { from: string; to: string }[];
  };
  expect(diagram.components).toHaveLength(11);
  expect([...diagram.boundaries[0]!.wraps].sort()).toEqual(
    [
      "orchestration",
      "memory",
      "knowledge",
      "context",
      "agent",
      "policy",
      "tools",
      "sandbox",
      "observability",
      "evaluation",
    ].sort(),
  );
  expect(diagram.boundaries[0]!.wraps).not.toContain("product");
  const connections = diagram.connections.map(({ from, to }) => `${from}:${to}`);
  for (const edge of ["context:agent", "agent:policy", "policy:tools", "tools:sandbox"])
    expect(connections).toContain(edge);
  expect(diagram.components.map(({ id }) => id)).not.toContain("inference");
  const theme = readFileSync(
    "publishing/a-place-to-do-the-work/diagrams/journal-theme.css",
    "utf8",
  );
  for (const token of ["paper", "ink", "muted", "rule", "green"])
    expect(theme).toContain(`__${token}__`);
  expect(theme).toContain(".c-region { fill: transparent; }");
});

test("selected Archify artwork matches its source and contains no viewer runtime", () => {
  const base = "publishing/site/public/artwork/why-drawloom";
  const sources = "publishing/a-place-to-do-the-work/diagrams";
  const sha = (value: string) => createHash("sha256").update(value).digest("hex");
  const journal = readFileSync("publishing/site/src/styles/journal.css", "utf8");
  const receipts = JSON.parse(readFileSync(`${base}/provenance.json`, "utf8")) as {
    name: string;
    specification: string;
    theme: string;
    palette: Record<string, string>;
    svg: string;
  }[];
  expect(receipts.map(({ name }) => name)).toEqual([
    "drawloom",
    "stack-2024",
    "stack-2025",
    "stack-2026",
  ]);
  for (const receipt of receipts) {
    const svg = readFileSync(`${base}/${receipt.name}.svg`, "utf8");
    expect(sha(svg)).toBe(receipt.svg);
    expect(sha(readFileSync(`${sources}/${receipt.name}.architecture.json`, "utf8"))).toBe(
      receipt.specification,
    );
    expect(sha(readFileSync(`${sources}/journal-theme.css`, "utf8"))).toBe(receipt.theme);
    for (const [key, value] of Object.entries(receipt.palette))
      expect(journal).toContain(`--${key}: ${value};`);
    expect(svg).toContain('data-theme="light"');
    expect(svg).not.toMatch(
      /<(script|foreignObject|image)\b|\bon\w+=|\bhref=|@import|role="button"/i,
    );
  }
});

test("the product landing page uses static Svelte composition and selected Synaptic Shuttle artwork", () => {
  const packageManifest = readFileSync("package.json", "utf8");
  const landingPage = readFileSync("publishing/site/src/pages/index.astro", "utf8");
  const transparentMap = readFileSync(
    "publishing/site/public/artwork/synaptic-shuttle/decision-map-transparent.png",
  );
  const vectorLogoPath = "publishing/site/public/artwork/synaptic-shuttle/logo.svg";
  const vectorLogo = existsSync(vectorLogoPath) ? readFileSync(vectorLogoPath, "utf8") : "";
  const landingViewPath = "publishing/site/src/components/LandingPageView.svelte";
  const landingView = existsSync(landingViewPath) ? readFileSync(landingViewPath, "utf8") : "";

  expect(packageManifest).toContain('"@astrojs/svelte": "catalog:"');
  expect(journalConfig.integrations).toEqual(["@astrojs/svelte"]);
  expect(existsSync(landingViewPath)).toBe(true);
  expect(landingPage).toContain(
    "import LandingPageView from '../components/LandingPageView.svelte'",
  );
  expect(landingPage).toContain("satisfies LandingPagePresentation");
  expect(landingPage).toContain("satisfies LandingPageActions");
  expect(landingPage).toContain("<LandingPageView {presentation} {actions} />");
  expect(landingView).toContain("presentation: LandingPagePresentation");
  expect(landingView).toContain("actions: LandingPageActions");
  expect(transparentMap[25]).toBe(6); // PNG truecolour with an alpha channel.
  expect(existsSync(vectorLogoPath)).toBe(true);
  expect(vectorLogo).toContain('viewBox="0 0 512 512"');
  expect(vectorLogo).toContain('aria-labelledby="logo-title logo-description"');
  expect(vectorLogo).not.toMatch(/<(script|foreignObject|image)\b|\bon\w+=|@import/i);
  expect(vectorLogo.replace("http://www.w3.org/2000/svg", "")).not.toMatch(/https?:/i);
  expect(landingPage).toContain("`${base}/artwork/drawloom/mark.png`");
});

test("production excludes draft routes and media; explicit preview renders accessible static articles", async () => {
  const temporary = mkdtempSync(join(tmpdir(), "drawloom-journal-test-"));
  try {
    const media = join(temporary, "rendered");
    mkdirSync(join(media, "workbench-example"), { recursive: true });
    // These are copy-boundary fixtures. Actual playback is verified separately
    // against journal:render output, without a Chromium render in every test run.
    writeFileSync(join(media, "workbench-example/workbench.mp4"), "test-video");
    writeFileSync(join(media, "workbench-example/workbench.png"), "test-poster");
    mkdirSync(join(media, "a-place-to-do-the-work"), { recursive: true });
    writeFileSync(join(media, "a-place-to-do-the-work/episode-steps.mp4"), "test-video");
    writeFileSync(join(media, "a-place-to-do-the-work/episode-steps.png"), "test-poster");
    for (const name of [
      "02-public-episode-opening.png",
      "03-programme-raw.png",
      "09-legacy-public-reconstruction.png",
      "10-legacy-admin-reconstruction.png",
      "11-current-public-homepage.png",
    ]) {
      writeFileSync(join(media, `a-place-to-do-the-work/${name}`), "test-screenshot");
    }
    for (const preview of [false, true]) {
      const output = join(temporary, preview ? "preview" : "production");
      const child = spawn(
        process.execPath,
        ["scripts/build-journal.ts", ...(preview ? ["--drafts"] : [])],
        {
          env: {
            ...process.env,
            JOURNAL_OUT_DIR: output,
            JOURNAL_MEDIA_DIR: media,
            JOURNAL_DRAFTS: "1",
          },
        },
      );
      const [stdout, stderr, status] = await Promise.all([
        readText(child.stdout!),
        readText(child.stderr!),
        exitCodeOf(child),
      ]);
      expect(status, stdout + stderr).toBe(0);
      const files = readdirSync(output, { recursive: true }).map(String);
      for (const page of files.filter((file) => file.endsWith(".html"))) {
        const html = readFileSync(join(output, page), "utf8");
        for (const match of html.matchAll(/(?:href|src|poster)="([^"]+)"/g)) {
          const target = new URL(match[1]!, `https://drawloom.org/${page}`);
          if (target.origin !== "https://drawloom.org") continue;
          const path = decodeURIComponent(target.pathname);
          const local = join(output, path.endsWith("/") ? `${path}index.html` : path);
          expect(existsSync(local), `${page} references missing ${target.pathname}`).toBe(true);
        }
      }
      for (const stylesheet of files.filter((file) => file.endsWith(".css"))) {
        for (const match of readFileSync(join(output, stylesheet), "utf8").matchAll(
          /url\(["']?(\/[^"')]+)["']?\)/g,
        )) {
          expect(
            existsSync(join(output, match[1]!)),
            `${stylesheet} references missing ${match[1]}`,
          ).toBe(true);
        }
      }
      const home = readFileSync(join(output, "index.html"), "utf8");
      const schema = JSON.parse(
        readFileSync(join(output, "schemas/1.0.0/plugin-extension.schema.json"), "utf8"),
      );
      expect(schema).toEqual(DrawloomPackageExtensionJsonSchema);
      // "How we decide": each map step opens its page once published. Drafts
      // render only in preview; until then the map falls back to GitHub.
      const exploreSteps = [
        "principles",
        "questions",
        "research",
        "decisions",
        "evidence",
        "get-started",
      ];
      const shown = exploreSteps.filter(
        (step) =>
          preview ||
          !/^draft: true$/m.test(readFileSync(`publishing/explore/${step}/page.md`, "utf8")),
      );
      for (const step of exploreSteps) {
        expect(files.includes(`${step}/index.html`), step).toBe(shown.includes(step));
        expect(home.includes(`href="/${step}/"`), step).toBe(shown.includes(step));
      }
      for (const step of shown) {
        const page = readFileSync(join(output, `${step}/index.html`), "utf8");
        const strip = page.match(/<nav class="step-strip"[\s\S]*?<\/nav>/)?.[0] ?? "";
        expect(strip.match(/href="/g), step).toHaveLength(shown.length);
        expect(strip).toContain(`href="/${step}/" aria-current="page"`);
        expect(page).toContain("of 6 · How we decide");
        expect(page).toContain('class="step-pager"');
      }
      expect(files.some((file) => file.endsWith("sources.md"))).toBe(false);
      if (!preview) {
        expect(home).toContain('href="https://drawloom.org/"');
        // Svelte marks {#each} blocks with comments; compare the text itself.
        const homeText = home.replace(/<!--[\s\S]*?-->/g, "");
        expect(homeText).toContain("Build AI helpers<br");
        expect(homeText).toContain("you can see, steer<br");
        // The design's code name is not reader-facing copy.
        expect(home.toLowerCase()).not.toContain("synaptic shuttle");
        expect(home).toContain("https://github.com/mafifi/drawloom/releases/tag/v0.0.0-preview.1");
        expect(home).toContain('href="/journal/"');
        expect(home).toContain('id="decision-map"');
        expect(home).toContain("/artwork/synaptic-shuttle/hero.png");
        expect(home).toContain("/artwork/drawloom/mark.png");
        expect(home).not.toContain("/artwork/synaptic-shuttle/logo.png");
        expect(home).toContain('<svg class="decision-map"');
        // Cropped to the artwork's drawn area, in its native 1672×941 coordinates.
        expect(home).toContain('<svg class="decision-map" viewBox="0 50 1672 650"');
        expect(home).toContain('role="group"');
        expect(home).not.toContain(
          'role="img" aria-labelledby="decision-map-title decision-map-description"',
        );
        expect(home).toContain("/artwork/synaptic-shuttle/decision-map-transparent.png");
        expect(home.match(/class="decision-map-link"/g)).toHaveLength(6);
        expect(home).toContain('aria-label="Principles: what we care about"');
        expect(home).toContain(">Principles</text>");
        expect(home).toContain(">What we care about</text>");
        expect(home).toContain("/articles/a-place-to-do-the-work/");
        expect(home).not.toContain("<astro-island");
        expect(home).not.toContain("workbench-example");
        expect(files.some((file) => file.includes("workbench-example"))).toBe(false);
        expect(home).toContain("a-place-to-do-the-work");
        const published = readFileSync(
          join(output, "articles/a-place-to-do-the-work/index.html"),
          "utf8",
        );
        expect(published).toContain("<h1>Why Drawloom?</h1>");
        expect(published).not.toContain("noindex");
        expect(published).not.toContain("Draft · local preview");
        expect(published).toContain("2026-09-05");
        expect(published).toContain('href="/journal/"');
        expect(files).toContain("journal/index.html");
        const journal = readFileSync(join(output, "journal/index.html"), "utf8");
        expect(journal).toContain("/articles/a-place-to-do-the-work/");
        expect(journal).not.toContain("workbench-example");
        expect(files).toContain("media/a-place-to-do-the-work/episode-steps.mp4");
        expect(files).toContain("media/a-place-to-do-the-work/03-programme-raw.png");
        expect(
          files.some((file) => file.includes("notes.md") || file.includes("reference.png")),
        ).toBe(false);
      } else {
        expect(home).toContain("noindex, nofollow");
        const article = readFileSync(join(output, "articles/workbench-example/index.html"), "utf8");
        expect(article).toContain("Read transcript");
        expect(article).toContain("noindex");
        expect(article).toContain("/media/workbench-example/workbench.mp4");
        expect(article).not.toMatch(/\bautoplay\b|<script[^>]+react/i);
        expect(files).toContain("media/workbench-example/workbench.mp4");
        const draft = readFileSync(
          join(output, "articles/a-place-to-do-the-work/index.html"),
          "utf8",
        );
        expect(draft).not.toContain("Draft · local preview");
        expect(draft).not.toContain("noindex");
        expect(draft).toContain('id="transcript"');
        expect(draft).toContain("<h1>Why Drawloom?</h1>");
        expect(draft.match(/class="architecture-figure"/g)).toHaveLength(3);
        for (const name of ["drawloom", "stack-2024", "stack-2025", "stack-2026"]) {
          expect(files).toContain(`artwork/why-drawloom/${name}.svg`);
          expect(draft).toContain(`/artwork/why-drawloom/${name}.svg`);
        }
        expect(draft).toContain('id="drawloom-map-caption"');
        expect(draft).toContain("The 10 capabilities Drawloom provides");
        expect(draft).not.toContain("11-current-public-homepage.png");
        expect(draft.match(/<video\b/g)).toHaveLength(1);
        expect(draft.indexOf("<video")).toBeLessThan(draft.indexOf('id="the-light-bulb-moment"'));
        expect(files).toContain("media/a-place-to-do-the-work/02-public-episode-opening.png");
        expect(files).toContain("media/a-place-to-do-the-work/03-programme-raw.png");
        expect(files).toContain("media/a-place-to-do-the-work/09-legacy-public-reconstruction.png");
        expect(files).toContain("media/a-place-to-do-the-work/10-legacy-admin-reconstruction.png");
        expect(files).toContain("media/a-place-to-do-the-work/12-operator-annual-plan.jpg");
        expect(files).toContain("media/a-place-to-do-the-work/13-operator-story-workspace.jpg");
        expect(draft.indexOf("12-operator-annual-plan.jpg")).toBeGreaterThan(
          draft.indexOf("what I mean by a"),
        );
        expect(draft.indexOf("12-operator-annual-plan.jpg")).toBeLessThan(
          draft.indexOf('id="a-better-place-to-make-an-episode"'),
        );
        expect(files).not.toContain("media/a-place-to-do-the-work/11-current-public-homepage.png");
        expect(files).toContain("media/a-place-to-do-the-work/episode-steps.mp4");
      }
    }
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}, 120_000);
