import { PLUGIN_SCHEMA, MCP_PACKAGE_SCHEMA, type PackageInspector } from './package.js';
export interface PackageFixture {
  root: string;
  write(path: string, contents: string): Promise<void>;
  dispose(): Promise<void>;
}
/** The same component/failure contract runs against each filesystem provider. */
export async function packageInspectionConformance(inspector: PackageInspector, create: () => Promise<PackageFixture>): Promise<void> {
  const fixture = await create();
  const check = (value: unknown, message: string) => { if (!value) throw Error(message); };
  try {
    await fixture.write('plugin.json', JSON.stringify({ $schema: PLUGIN_SCHEMA, name: 'sample', future: true, extensions: { 'org.example.unknown': 7 } }));
    await fixture.write('skills/outline/SKILL.md', '---\nname: outline\ndescription: Outline supplied notes\n---\nPRIVATE-TO-SKILL-BODY');
    await fixture.write('skills/outline/references/style.md', 'Use short sentences.');
    await fixture.write('skills/broken/SKILL.md', '---\nname: other\ndescription: invalid directory mismatch\n---\n');
    await fixture.write('mcp.json', JSON.stringify({ $schema: MCP_PACKAGE_SCHEMA, mcpServers: {
      valid: { type: 'stdio', command: 'synthetic-server' }, broken: { type: 'stdio', command: 'bad shell command' },
      old: { type: 'sse', url: 'https://example.com/mcp' },
    } }));
    let result = await inspector.inspectPackage(fixture.root);
    check(result.version === undefined, 'absent version remains absent');
    check(result.skills.length === 1 && result.skills[0]?.path === 'skills/outline/SKILL.md', 'source identity and independent skills');
    check(!JSON.stringify(result).includes('PRIVATE-TO-SKILL-BODY'), 'inventory contains no skill instructions');
    check(result.servers.length === 1 && result.servers[0]?.name === 'valid', 'independent valid servers');
    check(result.extensions['org.example.unknown'] === 7, 'unknown extension remains uninterpreted');
    check(result.diagnostics.some(d => d.component === 'extension:org.example.unknown' && d.code === 'ignored-extension'), 'unknown extension reported as ignored');
    check(result.diagnostics.some(d => d.component === 'server:old' && d.code === 'unsupported-transport'), 'legacy SSE warning');
    check((await inspector.readSkill(result, 'outline')).includes('PRIVATE-TO-SKILL-BODY'), 'explicit skill reading');
    check(await inspector.readSupportingFile(result, 'outline', 'references/style.md') === 'Use short sentences.', 'supporting file read');
    await fixture.write('plugin.json', JSON.stringify({ $schema: PLUGIN_SCHEMA, name: 'sample', version: 'spring edition' }));
    result = await inspector.inspectPackage(fixture.root);
    check(result.version === 'spring edition', 'versions need not be SemVer');
    await fixture.write('mcp.json', JSON.stringify({ $schema: 'https://example.com/unknown.schema.json', mcpServers: {} }));
    result = await inspector.inspectPackage(fixture.root);
    check(result.skills.length === 1 && result.servers.length === 0 && result.diagnostics.some(d => d.component === 'mcp'), 'unknown MCP schema isolates MCP');
    await fixture.write('plugin.json', JSON.stringify({ $schema: PLUGIN_SCHEMA, name: 'sample', version: 3 }));
    let rejected = false;
    try { await inspector.inspectPackage(fixture.root); } catch { rejected = true; }
    check(rejected, 'invalid known manifest fields reject package');
  } finally { await fixture.dispose(); }
}
