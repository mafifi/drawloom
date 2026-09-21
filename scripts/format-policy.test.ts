import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";

const manifest = JSON.parse(readFileSync("package.json", "utf8"));
// The dependency catalog lives in pnpm-workspace.yaml, not the root manifest.
const workspace = parseYaml(readFileSync("pnpm-workspace.yaml", "utf8"));

describe("formatting policy", () => {
  test("the root commands run the formatter and CI checks the baseline", () => {
    expect(manifest.scripts.format).toBe("biome format --write .");
    expect(manifest.scripts["check:format"]).toBe("biome format .");
    expect(manifest.scripts["check:ci"].split(" && ")).toContain("pnpm run check:format");
  });

  test("Biome is an exact root-catalog development dependency", () => {
    expect(manifest.devDependencies["@biomejs/biome"]).toBe("catalog:");
    expect(workspace.catalog["@biomejs/biome"]).toMatch(/^\d+\.\d+\.\d+$/);
  });

  test("configuration enables formatting without lint or assist rewrites", () => {
    const config = JSON.parse(readFileSync("biome.json", "utf8"));
    expect(config.formatter).toMatchObject({
      enabled: true,
      indentStyle: "space",
      indentWidth: 2,
      lineEnding: "lf",
      lineWidth: 100,
    });
    expect(config.javascript.formatter).toMatchObject({
      quoteStyle: "double",
      semicolons: "always",
    });
    expect(config.linter.enabled).toBe(false);
    expect(config.assist.enabled).toBe(false);
  });

  test("the CSS parser accepts the repository's Tailwind directives", () => {
    const config = JSON.parse(readFileSync("biome.json", "utf8"));
    expect(config.css.parser.tailwindDirectives).toBe(true);
  });

  test("unsupported and immutable source classes are outside the formatter baseline", () => {
    const config = JSON.parse(readFileSync("biome.json", "utf8"));
    expect(config.files.includes).toEqual(
      expect.arrayContaining([
        "!**/*.svelte",
        "!**/*.astro",
        "!**/fixtures/**",
        "!docs/**",
        "!knowledge/**",
        "!LICENSES/**",
        "!spikes/**",
        "!evaluations/knowledge/corpus.ts",
      ]),
    );
  });
});
