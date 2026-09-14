// Consume NUL-separated git diff paths so filenames cannot create output commands.
const exact = new Set([
  'scripts/build-journal.ts', 'scripts/publishing-scope.ts',
  'package.json', 'bun.lock', '.github/workflows/ci.yml', '.github/workflows/publishing.yml',
]);
const paths = (await Bun.stdin.text()).split('\0');
const publish = paths.some(path => exact.has(path) || path.startsWith('publishing/') || path.startsWith('packages/plugins/plugins/src/'));
console.log(`publish=${publish}`);
