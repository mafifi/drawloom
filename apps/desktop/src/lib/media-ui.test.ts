import { describe, expect, test } from 'bun:test';
import type { ResourceReference } from '@drawloom/host';
import {
  isMountedMediaPolicyOutdated,
  remoteMediaPreviewUrl,
  samePluginViewGeneration,
} from './media-ui.js';

const remoteImage: ResourceReference = {
  id: 'image/?',
  source: 'Synthetic media server',
  title: 'Remote image',
  uri: 'https://media.example/private/image.png?token=secret',
  mimeType: 'image/png',
  status: 'unavailable',
};

describe('shared remote media preview', () => {
  test('uses captured identities rather than exposing the remote URL to the browser frame', () => {
    const url = remoteMediaPreviewUrl('conversation/one', 'entry?two', remoteImage);

    expect(url).toBe('/api/remote-media?conversationId=conversation%2Fone&entryId=entry%3Ftwo&resourceId=image%2F%3F');
    expect(url).not.toContain('media.example');
    expect(url).not.toContain('token');
  });

  test('does not offer the host route for ineligible references', () => {
    const ineligible: ResourceReference[] = [
      { ...remoteImage, asset: { key: 'captured', mediaType: 'image/png', size: 4 } },
      { ...remoteImage, mimeType: 'text/plain' },
      { ...remoteImage, uri: 'file:///private/image.png' },
      { ...remoteImage, uri: undefined },
    ];
    for (const resource of ineligible) {
      expect(remoteMediaPreviewUrl('conversation', 'entry', resource)).toBeUndefined();
    }
  });
});

describe('plugin media policy reopen guard', () => {
  test('reports a mounted view as outdated only after its effective revision changes', () => {
    expect(isMountedMediaPolicyOutdated('', 'revision-2')).toBe(false);
    expect(isMountedMediaPolicyOutdated('revision-2', 'revision-2')).toBe(false);
    expect(isMountedMediaPolicyOutdated('revision-1', 'revision-2')).toBe(true);
  });

  test('accepts a toast action only for the same live conversation, view and frame generation', () => {
    const captured = { conversationId: 'conversation-a', viewId: 'view-a', generation: 3 };

    expect(samePluginViewGeneration(captured, captured)).toBe(true);
    expect(samePluginViewGeneration(captured, { ...captured, generation: 4 })).toBe(false);
    expect(samePluginViewGeneration(captured, { ...captured, conversationId: 'conversation-b' })).toBe(false);
    expect(samePluginViewGeneration(captured, undefined)).toBe(false);
  });
});
