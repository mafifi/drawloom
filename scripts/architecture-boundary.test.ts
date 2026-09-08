import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// Removing a boundary rule must allow the corresponding invalid import and
// fail these tests. Exercise the installed checker, not the config's text.
const repository = resolve(import.meta.dir, "..");

for (const [label, source, forbidden] of [
  ["local module", 'import "./local.ts";', false],
  ["private product package", 'import "@repo/clinic";', true],
  ["installed private package", 'import "@repo/installed";', true],
  ["nested installed private package", 'import "./apps/demo/entry.ts";', true],
  ["public installed package", 'import "public-example";', false],
  ["private plugin", 'export * from "@drawloom-workbenches/marketing";', true],
  ["outside checkout", 'import "../outside.ts";', true],
  ["dynamic outside import", 'void import("../outside.ts");', true],
  ["absolute outside import", "absolute", true],
  ["aliased outside import", 'import "outside-alias";', true],
  ["symlink outside checkout", 'import "./linked.ts";', true],
  [
    "type-only private import",
    'import type { Patient } from "@repo/clinic";',
    true,
  ],
  ["spike import", 'import "./spikes/proof.ts";', true],
] as const) {
  test(`architecture boundary: ${label}`, async () => {
    const fixture = await mkdtemp(join(tmpdir(), "drawloom-boundary-test-"));
    try {
      const checkout = join(fixture, "public");
      await mkdir(join(checkout, "spikes"), { recursive: true });
      await writeFile(
        join(checkout, "tsconfig.json"),
        JSON.stringify({
          compilerOptions: {
            baseUrl: ".",
            paths: { "outside-alias": ["../outside.ts"] },
          },
        }),
      );
      await writeFile(join(fixture, "outside.ts"), "export const secret = 1;");
      await symlink(join(fixture, "outside.ts"), join(checkout, "linked.ts"));
      const nested = join(checkout, "apps/demo");
      await mkdir(join(nested, "node_modules/@repo/nested"), {
        recursive: true,
      });
      await writeFile(join(nested, "entry.ts"), 'import "@repo/nested";');
      await writeFile(
        join(nested, "node_modules/@repo/nested/package.json"),
        JSON.stringify({ name: "@repo/nested", main: "index.js" }),
      );
      await writeFile(
        join(nested, "node_modules/@repo/nested/index.js"),
        "export const example = 1;",
      );
      for (const name of ["@repo/installed", "public-example"]) {
        const location = join(checkout, "node_modules", name);
        await mkdir(location, { recursive: true });
        await writeFile(
          join(location, "package.json"),
          JSON.stringify({ name, main: "index.js" }),
        );
        await writeFile(
          join(location, "index.js"),
          "export const example = 1;",
        );
      }
      await writeFile(join(checkout, "local.ts"), "export const example = 1;");
      await writeFile(
        join(checkout, "spikes/proof.ts"),
        "export const example = 1;",
      );
      await writeFile(
        join(checkout, "entry.ts"),
        source === "absolute"
          ? `import ${JSON.stringify(join(fixture, "outside.ts"))};`
          : source,
      );
      const result = Bun.spawnSync(
        [
          join(repository, "node_modules/.bin/depcruise"),
          "--config",
          join(repository, ".dependency-cruiser.mjs"),
          "--output-type",
          "err-long",
          "entry.ts",
        ],
        { cwd: checkout },
      );
      const output = result.stderr.toString() + result.stdout.toString();
      expect(result.exitCode, output).toBe(forbidden ? 1 : 0);
      if (forbidden) expect(output).toContain("error no-");
    } finally {
      await rm(fixture, { recursive: true, force: true });
    }
  }, 30_000);
}
