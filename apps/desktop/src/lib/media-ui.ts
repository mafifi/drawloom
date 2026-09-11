import type { ResourceReference } from '@drawloom/host';

export type PluginViewGeneration = Readonly<{
  conversationId: string;
  viewId: string;
  generation: number;
}>;

export function remoteMediaPreviewUrl(
  conversationId: string,
  entryId: string,
  resource: ResourceReference,
): string | undefined {
  if (resource.asset || !resource.uri || !resource.mimeType || !/^(?:image|audio|video)\//i.test(resource.mimeType)) return;
  try {
    const source = new URL(resource.uri);
    if (source.protocol !== 'http:' && source.protocol !== 'https:') return;
  } catch { return; }
  return '/api/remote-media?conversationId=' + encodeURIComponent(conversationId) +
    '&entryId=' + encodeURIComponent(entryId) + '&resourceId=' + encodeURIComponent(resource.id);
}

export function isMountedMediaPolicyOutdated(
  mountedRevision: string,
  currentRevision: string,
): boolean {
  return Boolean(mountedRevision && mountedRevision !== currentRevision);
}

export function samePluginViewGeneration(
  captured: PluginViewGeneration,
  current: PluginViewGeneration | undefined,
): boolean {
  return Boolean(current && captured.conversationId === current.conversationId &&
    captured.viewId === current.viewId && captured.generation === current.generation);
}
