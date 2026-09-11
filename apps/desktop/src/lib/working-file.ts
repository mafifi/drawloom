import type { ResourceReference } from '@drawloom/host';

/** Presentation only. The host independently validates each project-file read. */
export function workingFileReference(resource: ResourceReference, conversationId: string, directory: string) {
  if (resource.asset || !conversationId || !resource.uri?.startsWith('file:///') || !directory.startsWith('/') || directory === '/') return;
  try {
    const uri = new URL(resource.uri);
    if (uri.protocol !== 'file:' || uri.hostname || uri.href !== resource.uri || resource.uri.includes('?') || resource.uri.includes('#') || /%(?:2f|5c)/i.test(uri.pathname)) return;
    const path = decodeURIComponent(uri.pathname);
    if (path.includes('\0') || path.includes('\\') || !path.startsWith(directory + '/')) return;
    const relative = path.slice(directory.length + 1);
    if (relative.split('/').some(segment => !segment || segment === '.' || segment === '..')) return;
    const params = new URLSearchParams({ conversationId, path: relative });
    return { url: '/api/files?' + params, downloadUrl: '/api/files?' + params + '&download=1', mediaType: resource.mimeType || 'application/octet-stream' };
  } catch { return; }
}
