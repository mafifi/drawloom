import { expect, test } from "vitest";
import { readFileSync } from "node:fs";

const primitives = readFileSync(new URL("./src/theme/primitives.css", import.meta.url), "utf8");
const semantics = readFileSync(new URL("./src/theme/semantic.css", import.meta.url), "utf8");

test("Tailwind typography aliases resolve through the semantic scale", () => {
  const styles = declarations(readFileSync(new URL("./src/styles.css", import.meta.url), "utf8"));
  const roles = declarations(semantics);
  for (const name of [
    "xs",
    "sm",
    "base",
    "lg",
    "xl",
    "2xl",
    "3xl",
    "4xl",
    "5xl",
    "6xl",
    "7xl",
    "8xl",
    "9xl",
  ]) {
    const value = styles.get(`--text-${name}`);
    expect(value).toMatch(/^var\(--type-/);
    expect(roles.has(value!.slice(4, -1))).toBe(true);
    expect(styles.get(`--text-${name}--line-height`)).toMatch(/^var\(--leading-/);
  }
});

function declarations(source: string): Map<string, string> {
  return new Map([...source.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!]));
}

function luminance(value: string): number {
  const match = /^oklch\(([\d.]+) ([\d.]+) ([\d.]+)\)$/.exec(value);
  if (!match) throw new Error(`Expected an OKLCH primitive, received ${value}`);
  const [, l, c, h] = match;
  const angle = (Number(h) * Math.PI) / 180;
  const a = Number(c) * Math.cos(angle),
    b = Number(c) * Math.sin(angle);
  const ll = (Number(l) + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const mm = (Number(l) - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const ss = (Number(l) - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const r = 4.0767416621 * ll - 3.3077115913 * mm + 0.2309699292 * ss;
  const g = -1.2684380046 * ll + 2.6097574011 * mm - 0.3413193965 * ss;
  const blue = -0.0041960863 * ll - 0.7034186147 * mm + 1.707614701 * ss;
  return 0.2126 * r + 0.7152 * g + 0.0722 * blue;
}

test("semantic text remains readable on approved surfaces in both system themes", () => {
  const palette = declarations(primitives);
  const [light, dark] = semantics.split("@media (prefers-color-scheme: dark)");
  for (const source of [light!, `${light}${dark}`]) {
    const theme = declarations(source);
    const resolve = (name: string): number => {
      const token = /^var\((--[\w-]+)\)$/.exec(theme.get(name) ?? "")?.[1];
      return luminance(palette.get(token ?? "") ?? "missing");
    };
    for (const [ink, surface] of [
      ["--foreground", "--background"],
      ["--muted-foreground", "--accent"],
      ["--primary-foreground", "--primary"],
      ["--sidebar-foreground", "--sidebar"],
    ]) {
      const values = [resolve(ink!), resolve(surface!)].sort((a, b) => a - b);
      expect((values[1]! + 0.05) / (values[0]! + 0.05)).toBeGreaterThanOrEqual(4.5);
    }
  }
});
