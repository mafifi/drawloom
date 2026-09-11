import { expect, test } from 'bun:test';

test('replaced media viewers stop playback and release their current resource', async () => {
  const { releaseMedia } = await import('./native-viewer.js');
  const calls: string[] = [];
  const action = releaseMedia({ pause: () => { calls.push('pause'); }, removeAttribute: name => { calls.push('remove:' + name); }, load: () => { calls.push('load'); } });
  expect(calls).toEqual([]);
  action.destroy();
  expect(calls).toEqual(['pause', 'remove:src', 'load']);
});

test('unmounted image and document viewers discard their source', async () => {
  const { releaseSource } = await import('./native-viewer.js');
  const calls: string[] = [];
  const action = releaseSource({ removeAttribute: name => { calls.push(name); } });
  expect(calls).toEqual([]);
  action.destroy();
  expect(calls).toEqual(['src']);
});
