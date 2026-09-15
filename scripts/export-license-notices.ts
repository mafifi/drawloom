/** Explicit compliance export; not a build output or a licence-clearance claim. */
import { createHash } from "node:crypto";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, basename } from "node:path";
const root = resolve(import.meta.dir, "..");
const inventory = JSON.parse(
  readFileSync(
    resolve(root, "docs/reference/evidence/generated/dependency-licenses/inventory.json"),
    "utf8",
  ),
);
const directory = resolve(root, "LICENSES/texts");
mkdirSync(directory, { recursive: true });
const lines = [
  "# Third-party notices",
  "",
  "Inventory of installed JavaScript product candidates, not a final bundle SBOM.",
  "Exact release/native/runtime artifacts need their own review. Missing legal files",
  "are recorded as unresolved, not waived. Shared texts are stored once by SHA256.",
  "",
  "Regenerate explicitly with `bun run licenses:inventory && bun run licenses:export`.",
  "This compliance record is retained source material, not a build artifact.",
  "",
  "| Dependency | Declared licence | Retained legal files |",
  "| --- | --- | --- |",
];
const items = inventory.npm.filter((item: { distribution: string }) =>
  item.distribution.startsWith("runtime candidate"),
);
let missing = 0;
for (const item of items) {
  const links: string[] = [];
  for (const path of item.legalFiles) {
    const bytes = readFileSync(resolve(root, path));
    const hash = createHash("sha256").update(bytes).digest("hex");
    writeFileSync(resolve(directory, `${hash}.txt`), bytes);
    links.push(`[${basename(path)}](LICENSES/texts/${hash}.txt)`);
  }
  if (!links.length) missing++;
  const licence = typeof item.license === "string" ? item.license : JSON.stringify(item.license);
  lines.push(
    `| ${item.name}@${item.version} | ${licence?.replaceAll("|", "\\|") ?? "Unresolved"} | ${links.join(", ") || "**Unresolved: no local legal file found**"} |`,
  );
}
lines.push(
  "",
  `Inspected ${items.length} installed product candidates; ${missing} have no captured legal file.`,
  "",
  "Reviewed MPL dependencies and corresponding source locations are recorded in",
  "[LICENSES/MPL-REVIEW.md](LICENSES/MPL-REVIEW.md); preserve that source-availability notice",
  "when distributing the covered components.",
  "",
  "The complete locked inventory, including development/other-platform and native entries,",
  "is retained in [LICENSES/inventory.json](LICENSES/inventory.json). Entries with unknown",
  "licences or unresolved platform scope require review before distribution. Native licence",
  "text collection and exact artifact mapping are not established by this JavaScript export.",
  "",
);
writeFileSync(resolve(root, "THIRD_PARTY_NOTICES.md"), lines.join("\n"));
writeFileSync(
  resolve(root, "LICENSES/inventory.json"),
  JSON.stringify(
    {
      baseRevision: inventory.baseRevision,
      scope: inventory.scope,
      npm: inventory.npm.map(
        ({ legalFiles, ...item }: { legalFiles: string[]; [key: string]: unknown }) => item,
      ),
      rust: inventory.rust.map(
        ({ legalFiles, ...item }: { legalFiles: string[]; [key: string]: unknown }) => item,
      ),
      externalArtifacts: inventory.externalArtifacts,
      unresolvedRuntime: inventory.unresolvedRuntime,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  `Exported ${items.length} candidate notices; ${missing} missing legal-file findings remain.`,
);
