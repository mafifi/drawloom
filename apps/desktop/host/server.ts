import { randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import { extname, resolve, sep } from 'node:path';
import { lstat, realpath } from 'node:fs/promises';
import { ImportSchema, ResourceReadSchema, ResourceOpenSchema, DiscoveryResourceReadSchema, DiscoveryAuthenticationSchema } from '../src/lib/protocol.js';
import type { createDesktopApplication } from './application.js';
import { createStateFeed } from './state-feed.js';
import { HistoryStoreError } from '@drawloom/conversation-history';
import { observedHttp } from './telemetry.js';
import type { createTelemetryRelay } from './telemetry-relay.js';
import { fileResponse } from './file-response.js';
import { browserImportByteLimit } from './assets.js';
import { ProjectDirectoryError } from './projects.js';
import { remoteMediaResponse } from './remote-media-response.js';
import { createOrchestrationHttp } from './orchestration-http.js';
import { WorkflowControlError } from './orchestration-presentation.js';
import { KnowledgeCommandSchema } from '../src/lib/knowledge-protocol.js';
type Application = Awaited<ReturnType<typeof createDesktopApplication>>;
export function serveDesktop(app: Application, webRoot: string, port = 0, telemetry?: ReturnType<typeof createTelemetryRelay>, options: {pickDirectory?:(signal:AbortSignal)=>Promise<string|undefined>}={}) {
  const token = randomBytes(32).toString('hex');
  let bootstrap = true;
  let commandQueue: Promise<unknown> = Promise.resolve();
  let stateQueue: Promise<unknown> = Promise.resolve();
  const stateFeed = createStateFeed();
  const workflows = createOrchestrationHttp(app);
  let viewFiles: { token:string; mountId:string; conversationId:string; viewId:string } | undefined;
  async function workingResponse(request:Request,conversationId:string,path:string,headers?:Record<string,string>) {
    const reader=await app.openWorkingFile(conversationId,path);
    const types:Record<string,string>={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif','.mp4':'video/mp4','.webm':'video/webm','.mov':'video/quicktime','.mp3':'audio/mpeg','.wav':'audio/wav','.ogg':'audio/ogg','.pdf':'application/pdf','.txt':'text/plain','.md':'text/plain'};
    const mediaType=types[extname(path).toLowerCase()]??'application/octet-stream';
    return fileResponse(request,reader,{mediaType,immutable:false,...(headers?{headers}:{}),disposition:new URL(request.url).searchParams.has('download')||mediaType==='application/octet-stream'||mediaType==='video/quicktime'?'attachment':'inline'});
  }
  const secure = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob:; media-src 'self' blob:; connect-src 'self'; frame-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'" };
  const json = (data: unknown, status = 200) => Response.json(data, { status, headers: secure });
  const valid = (value: string) => value.length === token.length && timingSafeEqual(Buffer.from(value), Buffer.from(token));
  const server = Bun.serve({ hostname: '127.0.0.1', port, maxRequestBodySize: browserImportByteLimit,
    async fetch(request): Promise<Response> {
      const url = new URL(request.url); const origin = `http://127.0.0.1:${server.port}`;
      const cookieName = `drawloom_${server.port}`;
      if (url.origin !== origin || request.headers.get('host') !== `127.0.0.1:${server.port}`) return json({ error: 'Invalid host' }, 403);
      if (url.pathname === '/oauth/callback' && request.method === 'GET') {
        try {
          const status = await app.oauthCallback(url);
          return new Response(status.state === 'authorized' ? 'Sign-in complete. Return to Drawloom and reconnect the server.' : 'Sign-in was not completed. Return to Drawloom to inspect the connection.', { headers: { ...secure, 'Content-Type': 'text/plain; charset=utf-8' } });
        } catch { return new Response('This sign-in callback is invalid, cancelled or expired. Return to Drawloom to start again.', { status: 400, headers: { ...secure, 'Content-Type': 'text/plain; charset=utf-8' } }); }
      }
      if (url.pathname === '/bootstrap' && bootstrap && request.method === 'GET' && valid(url.searchParams.get('token') ?? '')) {
        bootstrap = false; return new Response(null, { status: 303, headers: { ...secure, Location: '/', 'Set-Cookie': `${cookieName}=${token}; HttpOnly; SameSite=Strict; Path=/` } });
      }
      if(url.pathname.startsWith('/api/view-files/')) {
        // A short-lived read scope, never the authenticated command cookie.
        // Opaque-origin frames may request media without access to host credentials.
        if(!['GET','HEAD'].includes(request.method))return json({error:'View file unavailable'},403);
        try {
          const parts=url.pathname.slice('/api/view-files/'.length).split('/');
          const scope=viewFiles;
          if(!scope || parts.shift()!==scope.token)throw Error('Invalid file scope');
          const presentation=await app.viewPresentation({conversationId:scope.conversationId,viewId:scope.viewId});
          if(presentation.mountId!==scope.mountId)throw Error('Expired file scope');
          return await workingResponse(request,scope.conversationId,decodeURIComponent(parts.join('/')),{'Access-Control-Allow-Origin':'null'});
        }catch{return json({error:'View file unavailable'},403);}
      }
      const cookie = request.headers.get('cookie')?.split(';').map(v => v.trim()).find(v => v.startsWith(cookieName + '='))?.slice(cookieName.length + 1) ?? '';
      if (!valid(cookie)) return json({ error: 'Open the host startup URL to authenticate this local app.' }, 401);
      const upload = url.pathname === '/api/import' && request.method === 'POST' && request.headers.get('content-type') === 'application/octet-stream';
      if (!['GET', 'HEAD'].includes(request.method) && (request.headers.get('origin') !== origin || (!upload && request.headers.get('content-type') !== 'application/json'))) return json({ error: 'Invalid command channel' }, 403);
      if (url.pathname === '/api/telemetry' && request.method === 'GET') return json({ enabled: telemetry?.enabled === true });
      if (url.pathname === '/api/telemetry/v1/traces' && request.method === 'POST') return telemetry ? telemetry.handle(request) : new Response(null, { status: 404, headers: secure });
      return observedHttp(request, async () => {
      try {
        if (['/api/orchestration/owners', '/api/orchestration/runs', '/api/orchestration/steps'].includes(url.pathname)) {
          const result = await workflows(request, url);
          return json(result.body, result.status);
        }
        if (url.pathname === '/api/knowledge' && request.method === 'POST') {
          const command = KnowledgeCommandSchema.parse(await request.json());
          // Cancellation must not queue behind the download it interrupts.
          if (command.action === 'cancel_download') return json(await app.knowledgeCommand(command));
          if (['status', 'search', 'evidence', 'export'].includes(command.action)) return json(await app.knowledgeCommand(command));
          const next = commandQueue.then(() => app.knowledgeCommand(command));
          commandQueue = next.catch(() => {}); return json(await next);
        }
        if(url.pathname==='/api/project-directory' && request.method==='POST') {
          if(!options.pickDirectory)return json({error:'Native folder selection is unavailable. Enter a local path instead.'},501);
          const next=commandQueue.then(()=>options.pickDirectory!(request.signal));commandQueue=next.catch(()=>{});
          const directory=await next;return json(directory?{directory}:{});
        }
        if (url.pathname === '/api/packages' && request.method === 'GET') return json(await app.installedPackages());
        if (url.pathname === '/api/packages' && request.method === 'POST') {
          const raw: unknown = await request.json();
          const next = commandQueue.then(() => app.packageAction(raw));
          commandQueue = next.catch(() => {}); return json(await next);
        }
        if (url.pathname === '/api/packages/oauth' && request.method === 'POST') {
          const raw: unknown = await request.json();
          // Cancellation must not sit behind the authorization request it cancels.
          return json(await app.packageOAuth(raw));
        }
        if (url.pathname === '/api/discovery' && request.method === 'GET') {
          // Discovery returns ready categories; slow native work continues in
          // its existing session without holding this HTTP request open.
          server.timeout(request, 120);
          const cursor=url.searchParams.get('cursor')??undefined;
          if(cursor && cursor.length>256)return json({error:'Invalid discovery cursor'},400);
          return json(await app.discover(url.searchParams.get('conversationId') ?? '', url.searchParams.get('refresh') === '1',cursor));
        }
        if (url.pathname === '/api/discovery/authenticate' && request.method === 'POST') {
          const input = DiscoveryAuthenticationSchema.parse(await request.json());
          return json(await app.authenticateIntegration(input.conversationId, input));
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
          const target={ viewId: decodeURIComponent(url.pathname.slice('/api/views/'.length)), conversationId: url.searchParams.get('conversationId')??'' };
          const presentation=await app.viewPresentation(target);
          if(viewFiles?.mountId!==presentation.mountId)viewFiles={...target,mountId:presentation.mountId,token:randomBytes(32).toString('hex')};
          const base=origin+'/api/view-files/'+viewFiles.token+'/';
          const baseElement=`<base href="${base}">`;
          const html=/<head(?:\s[^>]*)?>/i.test(presentation.html)?presentation.html.replace(/<head(?:\s[^>]*)?>/i,match=>match+baseElement):baseElement+presentation.html;
          const resourceSources=[base,...presentation.resourceDomains.filter(value=>value!==origin)].join(' ');
          const styleSources=presentation.styleDomains.filter(value=>value!==origin).join(' ');
          // No same-origin, forms, popups, downloads or top navigation. Self-navigation
          // is a browser limitation, not an asserted total network isolation boundary.
          return new Response(html, { headers: { ...secure, 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': `sandbox allow-scripts; default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline' ${styleSources}; font-src ${base} ${styleSources}; connect-src 'none'; img-src ${resourceSources}; media-src ${resourceSources}; frame-src 'none'; object-src 'none'; form-action 'none'; base-uri ${base}; frame-ancestors ${origin}` } });
        }
        if(url.pathname==='/api/remote-media' && request.method==='GET') {
          try {const media=await app.remoteMedia({conversationId:url.searchParams.get('conversationId'),entryId:url.searchParams.get('entryId'),resourceId:url.searchParams.get('resourceId')});return remoteMediaResponse(media,origin,media.resourceDomains);}
          catch {return new Response('This media reference is unavailable or its source has not been declared.',{status:404,headers:{...secure,'Content-Type':'text/plain; charset=utf-8'}});}
        }
        if (url.pathname === '/api/command' && request.method === 'POST') {
          const raw: unknown = await request.json();
          const next = commandQueue.then(() => app.command(raw)); commandQueue = next.catch(() => {});
          return json(await next);
        }
        if (url.pathname === '/api/import' && request.method === 'POST') {
          if (!upload || !request.body) return json({ error: 'Use streamed file upload' }, 400);
          const input = ImportSchema.parse({ conversationId:url.searchParams.get('conversationId'),name:url.searchParams.get('name'),mediaType:url.searchParams.get('mediaType') });
          const body = request.body;
          async function* chunks() {
            const reader=body!.getReader();
            let completed=false;
            try {
              while(true){const next=await reader.read();if(next.done){completed=true;return;}yield next.value;}
            } finally {
              if(!completed)await reader.cancel();
              // This reader exclusively owns the request body. EOF/cancel closes
              // it; Bun 1.2.23 can throw internally on releaseLock after this path.
            }
          }
          // The captured conversation owns this import. Network backpressure
          // must never hold up Stop or navigation. Application persistence and
          // controller mutations retain their own ordered writes.
          return json(await app.importAssetStream(chunks(), input.mediaType, input.name, input.conversationId!, request.signal));
        }
        if (url.pathname === '/api/files' && ['GET','HEAD'].includes(request.method)) {
          const path = url.searchParams.get('path') ?? '';
          return await workingResponse(request,url.searchParams.get('conversationId') ?? '',path);
        }
        if (url.pathname.startsWith('/api/assets/') && ['GET','HEAD'].includes(request.method)) {
          const asset = await app.authorizedAsset(decodeURIComponent(url.pathname.slice('/api/assets/'.length)));
          const reader = await app.assets.open(asset.key);
          // Documents use a separate sandboxed browsing context. SVG/HTML are never accepted.
          const disposition = asset.mediaType === 'video/quicktime' ? `attachment; filename="${asset.key}.mov"` : url.searchParams.has('download') ? 'attachment' : 'inline';
          return fileResponse(request,reader,{mediaType:asset.mediaType,immutable:true,disposition});
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
        if (error instanceof WorkflowControlError) return json({ error: error.message }, 400);
        if (error instanceof ProjectDirectoryError) return json({error:error.message},400);
        if (error instanceof HistoryStoreError) return json({ error: error.message, code: error.code }, error.code === 'invalid_cursor' ? 409 : 503);
        const known = error instanceof Error && !('issues' in error) ? error.message : 'Invalid request';
        const safe = ['Conversation unavailable', 'Workbench unavailable', 'Controller unavailable', 'Candidate unavailable', 'Document revision unavailable', 'Attachment unavailable', 'Asset unavailable', 'Only text documents can be attached as context', 'Unsupported or oversized file', 'This provider does not support interruption', 'Steering unavailable', 'provider unavailable', 'provider rejected', 'invalid state', 'Artifact title must be 1–120 characters', 'Synthetic mode accepts text. Attachments remain available as artifacts; choose Codex to send images.'];
        const discoveryErrors = ['Selection unavailable. Refresh the catalogue and select it again.', 'Resource unavailable', 'Selected context is too large', 'Only ready text resources can be selected as context', 'This file is viewable, but is not supported as direct model input. Use a suitable tool instead.'];
        return json({ error: safe.includes(known) || discoveryErrors.includes(known) || known === 'Synthetic mode is available only in Text studio. Choose Codex for this workbench.' ? known : 'The local operation failed. Check configuration or restart the host; no automatic retry occurred.' }, 400);
      }
      });
    },
  });
  app.bindOAuthRedirect(`http://127.0.0.1:${server.port}/oauth/callback`);
  return { url: `http://127.0.0.1:${server.port}/bootstrap?token=${token}`, origin: `http://127.0.0.1:${server.port}`, async close() { server.stop(true); await app.close(); } };
}
