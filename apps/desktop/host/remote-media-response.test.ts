import { expect,test } from 'bun:test';
import { remoteMediaResponse } from './remote-media-response.js';

test('remote media viewer escapes content, isolates scripts and never expands access to the host',async()=>{
  const response=remoteMediaResponse({url:'https://media.example/a.mp4?x=%22%3E%3Cscript%3E',mediaType:'video/mp4',title:'<script>bad()</script>'},'http://127.0.0.1:4444');
  const html=await response.text();
  expect(html).toContain('&lt;script&gt;bad()&lt;/script&gt;');
  expect(html).not.toContain('<script>bad()');
  const csp=response.headers.get('content-security-policy')!;
  expect(csp).toContain('sandbox allow-scripts');expect(csp).not.toContain('allow-same-origin');
  expect(csp).toContain("connect-src 'none'");expect(csp).not.toContain('signature');
  expect(response.headers.get('referrer-policy')).toBe('no-referrer');
  for(const media of [{url:'http://127.0.0.1:4444/api/assets/private',mediaType:'image/png'},
    {url:'https://media.example/x',mediaType:'text/html'},
    {url:'https://user:password@media.example/x',mediaType:'image/png'}])
    expect(()=>remoteMediaResponse({...media,title:'Test'},'http://127.0.0.1:4444')).toThrow();
});

test('remote viewer uses the shared media origins for declared CDN redirects, never the host origin',()=>{
  const response=remoteMediaResponse({url:'https://media.example/a.png',mediaType:'image/png',title:'Redirect'},'http://127.0.0.1:4444',['https://media.example','https://cdn.example','http://127.0.0.1:4444']);
  const media=response.headers.get('content-security-policy')!.split(';').find(p=>p.trim().startsWith('img-src'))!;
  expect(media).toContain('https://cdn.example');
  expect(media).not.toContain('127.0.0.1');
});
