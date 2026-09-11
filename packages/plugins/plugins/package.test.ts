import { test, expect } from 'bun:test';
import { PackageManifestSchema, PackageServerConfigSchema, DrawloomPackageExtensionSchema, PLUGIN_SCHEMA } from './src/index.ts';
test('optional dependencies describe tools, skills and only the existing orchestration capability', () => {
  expect(DrawloomPackageExtensionSchema.safeParse({ version: 1, optional: [
    { kind: 'tool', id: 'package:media:media:inspect' }, { kind: 'skill', id: 'package:editor:skill:edit' },
    { kind: 'capability', id: 'orchestration' },
  ] }).success).toBe(true);
  expect(DrawloomPackageExtensionSchema.safeParse({ version: 1, optional: [{ kind: 'capability', id: 'host' }] }).success).toBe(false);
});
test('manifest schemas reject unsupported versions and invalid known metadata, retaining optional release strings', () => {
  expect(PackageManifestSchema.safeParse({ $schema: 'https://example.com/schema', name: 'sample' }).success).toBe(false);
  for (const metadata of [{ author: { unknown: 'x' } }, { keywords: 'wrong' }, { name: 'wrong--name' }]) {
    expect(PackageManifestSchema.safeParse({ $schema: PLUGIN_SCHEMA, name: 'sample', ...metadata }).success).toBe(false);
  }
  expect(PackageManifestSchema.parse({ $schema: PLUGIN_SCHEMA, name: 'sample', version: '', homepage: 'not a URL' }).version).toBe('');
});
test('remote metadata rejects ambiguous headers and insecure or credential-bearing URLs at inspection', () => {
  for (const url of ['http://example.com/mcp', 'https://user:secret@example.com', 'https://example.com/#', 'file:///path']) {
    expect(PackageServerConfigSchema.safeParse({ type: 'streamable-http', url }).success).toBe(false);
  }
  for (const headers of [{ A: 'a', a: 'b' }, { 'bad name': 'value' }, { good: 'line\nbreak' }, { good: 'not-a-header-😀' }]) {
    expect(PackageServerConfigSchema.safeParse({ type: 'streamable-http', url: 'https://example.com/mcp', headers }).success).toBe(false);
  }
  for (const url of ['http://localhost/mcp', 'http://127.8.0.1/mcp', 'http://[::1]/mcp', 'https://example.com']) {
    expect(PackageServerConfigSchema.safeParse({ type: 'streamable-http', url }).success).toBe(true);
  }
});
test('stdio rejects shell commands, reserved environment and closed-variant mixing', () => {
  for (const config of [{ command: 'bun run app' }, { command: '/usr/bin/bun' }, { command: '${PLUGIN_ROOT}/bin' }, { command: 'bun', url: 'https://example.com' }, { command: 'bun', env: { PLUGIN_ROOT: 'forged' } }, { command: 'bun', cwd: '/outside' }]) {
    expect(PackageServerConfigSchema.safeParse({ type: 'stdio', ...config }).success).toBe(false);
  }
});
test('Drawloom metadata accepts existing requirements and opening-tool references only with a relative prebuilt backend', () => {
  expect(DrawloomPackageExtensionSchema.safeParse({ version: 1, backend: { entrypoint: './dist/backend.mjs' }, requires: [{ kind: 'capability', id: 'orchestration' }], workbenches: [{ id: 'notes', title: 'Notes', openingTool: { server: 'backend', tool: 'open' } }] }).success).toBe(true);
  for (const entrypoint of ['../backend.js', '/backend.js', 'backend.ts', 'https://example.com/backend.js']) {
    expect(DrawloomPackageExtensionSchema.safeParse({ version: 1, backend: { entrypoint } }).success).toBe(false);
  }
});

test('Drawloom metadata accepts only package-relative prebuilt JavaScript workflow modules', () => {
  expect(DrawloomPackageExtensionSchema.safeParse({
    version: 1,
    workflows: { entrypoint: './dist/workflows.js' },
  }).success).toBe(true);
  for (const entrypoint of ['../workflows.js', '/workflows.js', 'workflows.ts', 'https://example.com/workflows.js']) {
    expect(DrawloomPackageExtensionSchema.safeParse({ version: 1, workflows: { entrypoint } }).success).toBe(false);
  }
});
