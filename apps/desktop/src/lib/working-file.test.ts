import { expect, test } from 'bun:test';
import { workingFileReference } from './working-file.js';
import type { ResourceReference } from '@drawloom/host';

const resource = (uri: string, mimeType?: string): ResourceReference => ({ id: 'file', title: 'File', source: 'provider', status: 'unavailable', uri, ...(mimeType ? { mimeType } : {}) });

test('working-file URLs keep the captured conversation and encode only a relative path', () => {
  const value = workingFileReference(resource('file:///work/project/media/my%20clip.mp4', 'video/mp4'), 'conversation-a', '/work/project');
  expect(value).toEqual({ url: '/api/files?conversationId=conversation-a&path=media%2Fmy+clip.mp4', downloadUrl: '/api/files?conversationId=conversation-a&path=media%2Fmy+clip.mp4&download=1', mediaType: 'video/mp4' });
});

test('working-file references reject remote, escaping and non-canonical paths', () => {
  for (const uri of [
    'https://example.com/file.mp4', 'file://other/work/project/file.mp4', 'file://localhost/work/project/file.mp4',
    'file:///work/project-other/file.mp4', 'file:///work/project', 'file:///work/outside.mp4',
    'file:///work/project/../outside.mp4', 'file:///work/project/%2e%2e/outside.mp4',
    'file:///work/project/sub/../file.mp4', 'file:///work/project/%2e/file.mp4',
    'file:///work/project/sub/%2Ffile.mp4', 'file:///work/project/sub%5Cfile.mp4', 'file:///work/project/file%00.mp4',
    'file:///work/project/file.mp4?x=1', 'file:///work/project/file.mp4#clip', 'file:///work/project//file.mp4',
    'file:///work/project/file.mp4?', 'file:///work/project/file.mp4#', 'file:///work/project/fi\nle.mp4',
    'file:///work/project/%invalid',
  ]) expect(workingFileReference(resource(uri), 'conversation-a', '/work/project')).toBeUndefined();
  expect(workingFileReference(resource('file:///work/project/file'), '', '/work/project')).toBeUndefined();
});

test('cached assets take precedence and unknown file formats remain downloadable', () => {
  const value = resource('file:///work/project/archive.bin');
  expect(workingFileReference(value, 'conversation-a', '/work/project')?.mediaType).toBe('application/octet-stream');
  value.asset = { key: 'captured', size: 20, mediaType: 'text/plain' };
  expect(workingFileReference(value, 'conversation-a', '/work/project')).toBeUndefined();
});
