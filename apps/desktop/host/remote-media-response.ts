import { randomBytes } from 'node:crypto';
import { remoteMediaUrl } from './media-policy.js';
import { ResourceOriginSchema } from '../src/lib/package-protocol.js';

const escape=(value:string)=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
/** A host-authored isolated viewer. The browser retrieves media; this is not a proxy. */
export function remoteMediaResponse(media:{url:string;mediaType:string;title:string},hostOrigin:string,sharedOrigins:readonly string[]=[]):Response {
  const url=remoteMediaUrl(media.url,media.mediaType);
  if(!url || url.origin===hostOrigin)throw Error('Resource unavailable');
  const origins=[...new Set([url.origin,...sharedOrigins.map(origin=>ResourceOriginSchema.parse(origin))])].filter(origin=>origin!==hostOrigin).join(' ');
  const nonce=randomBytes(24).toString('base64');
  const tag=media.mediaType.startsWith('image/')?'img':media.mediaType.startsWith('audio/')?'audio':'video';
  const attributes=`id="media" src="${escape(url.href)}" ${tag==='img'?`alt="${escape(media.title)}" referrerpolicy="no-referrer"`:'controls preload="metadata"'}`;
  const element=tag==='img'?`<img ${attributes}>`:`<${tag} ${attributes}></${tag}>`;
  const html=`<!doctype html><html><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"><meta name="viewport" content="width=device-width"><title>${escape(media.title)}</title><style>
    :root{color-scheme:light dark}body{margin:0;font:14px system-ui;background:transparent;color:light-dark(#262626,#e5e5e5)}
    img,video{display:block;max-width:100%;max-height:460px;margin:auto}audio{width:100%}p{line-height:1.5}
  </style></head><body><p id="error" hidden>This media could not be loaded. Its link may have expired or the provider may be unavailable. Ask the source plugin for a fresh link; no generation was retried.</p>${element}<script nonce="${nonce}">
    document.getElementById('media').addEventListener('error',()=>{document.getElementById('error').hidden=false;});
  </script></body></html>`;
  return new Response(html,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff',
    'Content-Security-Policy':`sandbox allow-scripts; default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; img-src ${origins}; media-src ${origins}; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors ${hostOrigin}`}});
}
