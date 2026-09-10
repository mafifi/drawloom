import { randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import { resolve, sep } from 'node:path';
import { lstat, realpath } from 'node:fs/promises';
import { ImportSchema, ResourceReadSchema, ResourceOpenSchema, DiscoveryResourceReadSchema } from '../src/lib/protocol.js';
import type { createDesktopApplication } from './application.js';
import { createStateFeed } from './state-feed.js';
import { HistoryStoreError } from '@drawloom/conversation-history';
type Application = Awaited<ReturnType<typeof createDesktopApplication>>;
export function serveDesktop(app: Application, webRoot: string, port = 0) {
  const token = randomBytes(32).toString('hex');
  let bootstrap = true;
  let commandQueue: Promise<unknown> = Promise.resolve();
  let stateQueue: Promise<unknown> = Promise.resolve();
  const stateFeed = createStateFeed();
  const secure = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob:; media-src 'self' blob:; connect-src 'self'; frame-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'" };
  const json = (data: unknown, status = 200) => Response.json(data, { status, headers: secure });
  const valid = (value: string) => value.length === token.length && timingSafeEqual(Buffer.from(value), Buffer.from(token));
  const server = Bun.serve({ hostname: '127.0.0.1', port, maxRequestBodySize: 25 * 1024 * 1024,
    async fetch(request): Promise<Response> {
      const url = new URL(request.url); const origin = `http://127.0.0.1:${server.port}`;
      const cookieName = `drawloom_${server.port}`;
      if (url.origin !== origin || request.headers.get('host') !== `127.0.0.1:${server.port}`) return json({ error: 'Invalid host' }, 403);
      if (url.pathname === '/bootstrap' && bootstrap && request.method === 'GET' && valid(url.searchParams.get('token') ?? '')) {
        bootstrap = false; return new Response(null, { status: 303, headers: { ...secure, Location: '/', 'Set-Cookie': `${cookieName}=${token}; HttpOnly; SameSite=Strict; Path=/` } });
      }
      const cookie = request.headers.get('cookie')?.split(';').map(v => v.trim()).find(v => v.startsWith(cookieName + '='))?.slice(cookieName.length + 1) ?? '';
      if (!valid(cookie)) return json({ error: 'Open the host startup URL to authenticate this local app.' }, 401);
      if (!['GET', 'HEAD'].includes(request.method) && (request.headers.get('origin') !== origin || request.headers.get('content-type') !== 'application/json')) return json({ error: 'Invalid command channel' }, 403);
      try {
        if (url.pathname === '/api/discovery' && request.method === 'GET') {
          // Cold native catalogues can span many metadata pages. Extend this
          // authenticated read only; provider requests retain their own bounds.
          server.timeout(request, 120);
          return json(await app.discover(url.searchParams.get('conversationId') ?? '', url.searchParams.get('refresh') === '1'));
        }
        if (url.pathname === '/api/discovery/resource/read' && request.method === 'POST') {
          const input = DiscoveryResourceReadSchema.parse(await request.json());
          const next = commandQueue.then(() => app.readDiscoveredResource(input.conversationId, input));
          commandQueue = next.catch(() => {}); return json(await next);
        }
        if (url.pathname === '/api/resource/read' && request.method === 'POST') {
          const input = ResourceReadSchema.parse(await request.json());
          const next = commandQueue.then(() => app.readResource(input.conversationId, input.entryId, input.resourceId));
          commandQueue = next.catch(() => {}); return json(await next);
        }
        if (url.pathname === '/api/resources' && request.method === 'GET') {
          return json(await app.resourcePage(url.searchParams.get('conversationId') ?? '', url.searchParams.get('viewId') ?? '', url.searchParams.get('cursor') ?? undefined));
        }
        if (url.pathname === '/api/resource/open' && request.method === 'POST') {
          const input = ResourceOpenSchema.parse(await request.json());
          const next = commandQueue.then(() => app.openListedResource(input.conversationId, input.viewId, input.uri));
          commandQueue = next.catch(() => {}); return json(await next);
        }
        if (url.pathname === '/api/state' && request.method === 'GET') {
          const next = stateQueue.then(async () => stateFeed.read(await app.snapshot(), url.searchParams.get('since') ?? undefined));
          stateQueue = next.catch(() => {});
          const update = await next;
          return update ? json(update) : new Response(null, { status: 204, headers: secure });
        }
        if ((url.pathname === '/api/history' || url.pathname === '/api/history/changes') && request.method === 'GET') {
          const id = url.searchParams.get('conversationId') ?? '';
          const limit = url.searchParams.has('limit') ? { limit: Number(url.searchParams.get('limit')) } : {};
          const data = url.pathname.endsWith('/changes')
            ? await app.historyChanges(id, { ...limit, ...(url.searchParams.has('after') ? { after: url.searchParams.get('after')! } : {}) })
            : await app.historyPage(id, { ...limit, ...(url.searchParams.has('before') ? { before: url.searchParams.get('before')! } : {}) });
          const cursor = 'cursor' in data ? data.cursor : data.changeCursor;
          const etag = '"' + createHash('sha256').update(JSON.stringify([cursor, data.status])).digest('hex') + '"';
          const headers = { ...secure, ETag: etag };
          if ('cursor' in data && !data.entries.length && request.headers.get('if-none-match') === etag) return new Response(null, { status: 204, headers });
          return Response.json(data, { headers });
        }
        if (url.pathname === '/api/view-session' && request.method === 'POST') {
          const raw: unknown = await request.json();
          const next = commandQueue.then(() => app.viewSession(raw)); commandQueue = next.catch(() => {});
          return json(await next);
        }
        if (url.pathname === '/api/view-request' && request.method === 'POST') {
          const raw: unknown = await request.json();
          // Validate captured parent routing at dispatch time, in the same queue as navigation.
          const next = commandQueue.then(() => app.viewRequest(raw)); commandQueue = next.catch(() => {});
          return json(await next);
        }
        if (url.pathname === '/api/view-interaction' && request.method === 'POST') {
          const raw: unknown = await request.json();
          const next = commandQueue.then(() => app.viewInteraction(raw)); commandQueue = next.catch(() => {});
          return json(await next);
        }
        if (url.pathname.startsWith('/api/views/') && request.method === 'GET') {
          const html = app.viewHtml({ viewId: decodeURIComponent(url.pathname.slice('/api/views/'.length)), conversationId: url.searchParams.get('conversationId') });
          // No same-origin, forms, popups, downloads or top navigation. Self-navigation
          // is a browser limitation, not an asserted total network isolation boundary.
          return new Response(html, { headers: { ...secure, 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': `sandbox allow-scripts; default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'none'; img-src 'none'; media-src 'none'; frame-src 'none'; object-src 'none'; form-action 'none'; base-uri 'none'; frame-ancestors ${origin}` } });
        }
        if (url.pathname === '/api/command' && request.method === 'POST') {
          const raw: unknown = await request.json();
          const next = commandQueue.then(() => app.command(raw)); commandQueue = next.catch(() => {});
          return json(await next);
        }
        if (url.pathname === '/api/import' && request.method === 'POST') {
          const input = ImportSchema.parse(await request.json());
          if (!/^[A-Za-z0-9+/]+={0,2}$/.test(input.base64)) return json({ error: 'Invalid file encoding' }, 400);
          const next = commandQueue.then(() => app.importAsset(Buffer.from(input.base64, 'base64'), input.mediaType, input.name, input.conversationId)); commandQueue = next.catch(() => {});
          return json(await next);
        }
        if (url.pathname.startsWith('/api/assets/') && request.method === 'GET') {
          const asset = await app.authorizedAsset(decodeURIComponent(url.pathname.slice('/api/assets/'.length)));
          const bytes = await app.assets.read(asset.key);
          // Documents use a separate sandboxed browsing context. SVG/HTML are never accepted.
          const disposition = asset.mediaType === 'video/quicktime' ? `attachment; filename="${asset.key}.mov"` : url.searchParams.has('download') ? 'attachment' : 'inline';
          const headers = { ...secure, 'Content-Type': asset.mediaType, 'Content-Disposition': disposition, 'Content-Security-Policy': "sandbox; default-src 'none'; style-src 'unsafe-inline'" };
          const range = request.headers.get('range');
          if (range) {
            const match = /^bytes=(\d+)-(\d*)$/.exec(range); if (!match) return new Response(null, { status: 416, headers });
            const start = Number(match[1]), end = match[2] ? Math.min(Number(match[2]), bytes.length - 1) : bytes.length - 1;
            if (start > end || start >= bytes.length) return new Response(null, { status: 416, headers });
            return new Response(bytes.slice(start, end + 1), { status: 206, headers: { ...headers, 'Content-Range': `bytes ${start}-${end}/${bytes.length}`, 'Accept-Ranges': 'bytes' } });
          }
          return new Response(new Uint8Array(bytes), { headers: { ...headers, 'Accept-Ranges': 'bytes' } });
        }
        if (request.method !== 'GET' && request.method !== 'HEAD') return json({ error: 'Not found' }, 404);
        if (url.pathname === '/favicon.ico') return new Response(null, { status: 204, headers: secure });
        const base = await realpath(webRoot);
        let path = resolve(base, '.' + decodeURIComponent(url.pathname));
        if (!path.startsWith(base + sep) && path !== base) return json({ error: 'Not found' }, 404);
        if (path === base) path = resolve(base, 'index.html');
        try { if ((await lstat(path)).isSymbolicLink() || !(await realpath(path)).startsWith(base + sep)) return json({ error: 'Not found' }, 404); }
        catch { return json({ error: 'Not found' }, 404); }
        const file = Bun.file(path);
        if (path.endsWith('.html')) {
          const nonce = randomBytes(24).toString('base64');
          const html = (await file.text()).replaceAll('<script', `<script nonce="${nonce}"`);
          return new Response(request.method === 'HEAD' ? null : html, { headers: { ...secure, 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': secure['Content-Security-Policy'].replace("script-src 'self'", `script-src 'self' 'nonce-${nonce}'`) } });
        }
        return new Response(request.method === 'HEAD' ? null : file, { headers: secure });
      } catch (error) {
        if (error instanceof HistoryStoreError) return json({ error: error.message, code: error.code }, error.code === 'invalid_cursor' ? 409 : 503);
        const known = error instanceof Error && !('issues' in error) ? error.message : 'Invalid request';
        const safe = ['Conversation unavailable', 'Workbench unavailable', 'Controller unavailable', 'Candidate unavailable', 'Document revision unavailable', 'Attachment unavailable', 'Asset unavailable', 'Only text documents can be attached as context', 'Unsupported or oversized file', 'This provider does not support interruption', 'Steering unavailable', 'provider unavailable', 'provider rejected', 'invalid state', 'Artifact title must be 1–120 characters', 'Synthetic mode accepts text. Attachments remain available as artifacts; choose Codex to send images.'];
        const discoveryErrors = ['Selection unavailable. Refresh the catalogue and select it again.', 'Resource unavailable', 'Selected context is too large', 'Only ready text resources can be selected as context', 'This file is viewable, but is not supported as direct model input. Use a suitable tool instead.'];
        return json({ error: safe.includes(known) || discoveryErrors.includes(known) || known === 'Synthetic mode is available only in Text studio. Choose Codex for this workbench.' ? known : 'The local operation failed. Check configuration or restart the host; no automatic retry occurred.' }, 400);
      }
    },
  });
  return { url: `http://127.0.0.1:${server.port}/bootstrap?token=${token}`, origin: `http://127.0.0.1:${server.port}`, async close() { server.stop(true); await app.close(); } };
}
