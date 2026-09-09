import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
type Package = {
  directory: string;
  name: string;
  dependencies: Record<string, string>;
  build?: string;
};
const packages: Package[] = [];
for (const group of await readdir("packages", { withFileTypes: true })) {
  if (!group.isDirectory()) continue;
  for (const entry of await readdir(join("packages", group.name), {
    withFileTypes: true,
  })) {
    if (!entry.isDirectory()) continue;
    const directory = join("packages", group.name, entry.name);
    const manifest = JSON.parse(
      await readFile(join(directory, "package.json"), "utf8"),
    ) as { name: string; dependencies?: Record<string, string>; scripts?: { build?: string } };
    packages.push({
      directory,
      name: manifest.name,
      dependencies: manifest.dependencies ?? {},
      ...(manifest.scripts?.build ? { build: manifest.scripts.build } : {}),
    });
  }
}
const built = new Set<string>();
while (built.size < packages.length) {
  const ready = packages.filter(
    (p) =>
      !built.has(p.name) &&
      Object.keys(p.dependencies).every(
        (d) => !d.startsWith("@drawloom/") || built.has(d),
      ),
  );
  if (!ready.length)
    throw Error("Package dependency cycle or missing dependency");
  for (const p of ready) {
    const result = Bun.spawn(
      p.build ? ["bun", "run", "--cwd", p.directory, "build"] : [
        "bun",
        "x",
        "--no-install",
        "tsc",
        "-p",
        join(p.directory, "tsconfig.json"),
      ],
      { stdout: "inherit", stderr: "inherit" },
    );
    if ((await result.exited) !== 0) process.exit(1);
    built.add(p.name);
  }
}
console.log(`Built ${built.size} public packages`);
