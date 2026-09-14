import { expect, test } from 'bun:test';
import { addAtlasNavigation } from './atlas-navigation.mjs';

const page = '<html><head></head><body><svg><g id="node-knowledge" data-node-id="knowledge" tabindex="0" role="button" aria-pressed="false"><title>Knowledge</title><g><rect width="250"/></g><text>Knowledge</text></g></svg></body></html>';
const maps = [{ name: 'overview', title: 'Ownership map' }, { name: 'knowledge', title: 'Knowledge & memory' }];

test('overview links are not hidden inside a single accessible image', () => {
  const result = addAtlasNavigation(page.replace('<svg>', '<svg role="img">'), maps, 'overview', [{ id: 'knowledge', name: 'knowledge', title: 'Knowledge' }]);
  expect(result).toContain('<svg role="group">');
});

test('overview family tiles become native links without intercepting focus controls', () => {
  const result = addAtlasNavigation(page, maps, 'overview', [{ id: 'knowledge', name: 'knowledge', title: 'Knowledge & memory' }]);
  expect(result).toContain('<a href="knowledge.html" aria-label="Open Knowledge &amp; memory map" class="atlas-tile">');
  expect(result).toContain('<g><rect width="250"/></g><text>Knowledge</text></g></a>');
  expect(result).not.toContain('data-node-id="knowledge"');
  expect(result).not.toContain('role="button"');
});

test('detail maps retain inspection and offer a current-page marker and routes back', () => {
  const result = addAtlasNavigation(page, maps, 'knowledge');
  expect(result).toContain('href="overview.html"');
  expect(result).toContain('href="index.md"');
  expect(result).toContain('href="knowledge.html" aria-current="page"');
  expect(result).toContain('data-node-id="knowledge"');
});

test('renderer drift or missing destinations fail the build instead of silently losing navigation', () => {
  expect(() => addAtlasNavigation(page, maps, 'overview', [{ id: 'missing', name: 'knowledge', title: 'Knowledge' }])).toThrow();
  expect(() => addAtlasNavigation(page, maps, 'overview', [{ id: 'knowledge', name: 'missing', title: 'Missing' }])).toThrow();
});
