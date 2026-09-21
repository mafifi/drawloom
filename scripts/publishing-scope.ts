import { text as readStdin } from "node:stream/consumers";
// Consume NUL-separated git diff paths so filenames cannot create output commands.
const exact = new Set([
  "scripts/build-journal.ts",
  "scripts/publishing-scope.ts",
  "package.json",
  "pnpm-lock.yaml",
  ".github/workflows/ci.yml",
  ".github/workflows/publishing.yml",
]);
const paths = (await readStdin(process.stdin)).split("\0");
const publish = paths.some(
  (path) =>
    exact.has(path) ||
    path.startsWith("publishing/") ||
    path.startsWith("packages/plugins/plugins/src/"),
);
console.log(`publish=${publish}`);
