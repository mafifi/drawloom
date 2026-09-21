import { serve } from "@hono/node-server";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
/** Manual WKWebView acceptance fixture. No agent, project data or external traffic. */
const page = `<!doctype html><html lang="en"><meta charset="utf-8">
<title>Native browser acceptance</title><h1>Native browser acceptance</h1>
<p>Loopback-only synthetic checks. Media tracks are stopped immediately if granted.</p>
<button id="storage">Write storage marker</button>
<button id="read">Read storage marker</button>
<button id="clear">Clear test markers</button>
<button id="popup">Open popup</button>
<a href="/download" download="synthetic.txt">Download synthetic file</a>
<button id="camera">Request camera</button>
<button id="microphone">Request microphone</button>
<button id="location">Request location</button>
<button id="host">Check protected host</button>
<a href="/redirect">Redirect to protected host</a>
<a href="file:///etc/hosts">Forbidden file navigation</a>
<pre id="result" role="status">Ready</pre>
<script>
const result = document.getElementById('result');
const show = text => result.textContent = text;
document.getElementById('storage').onclick = () => {
 localStorage.setItem('native-browser-acceptance', 'synthetic-marker');
 document.cookie = 'native-browser-acceptance=synthetic-marker; Max-Age=3600; SameSite=Lax; path=/';
 show('Synthetic marker written');
};
document.getElementById('read').onclick = () => show(JSON.stringify({
 localStorage: localStorage.getItem('native-browser-acceptance'), cookie: document.cookie
}));
document.getElementById('clear').onclick = () => {
 localStorage.removeItem('native-browser-acceptance');
 document.cookie = 'native-browser-acceptance=; Max-Age=0; path=/';
 show('Test markers cleared');
};
document.getElementById('popup').onclick = () => { window.open('/popup'); show('Popup requested'); };
for (const [id, constraints] of [['camera', {video:true}], ['microphone', {audio:true}]]) {
 document.getElementById(id).onclick = async () => {
  show(id + ' requested');
  try { const stream = await navigator.mediaDevices.getUserMedia(constraints);
   stream.getTracks().forEach(track => track.stop()); show(id + ' granted; tracks stopped');
  } catch(error) { show(id + ': ' + error.name); }
 };
}
document.getElementById('location').onclick = () => {
 show('Location requested');
 navigator.geolocation.getCurrentPosition(() => show('Location granted (coordinates not retained)'),
  error => show('Location error code ' + error.code), {timeout:5000});
};
document.getElementById('host').onclick = async () => {
 try { const response = await fetch('http://127.0.0.1:4488/', {credentials:'include'});
  show('Protected host response ' + response.status);
 } catch(error) { show('Protected host fetch unreadable: ' + error.name); }
 const frame = document.createElement('iframe');
 frame.title = 'Protected host isolation probe'; frame.src = 'http://127.0.0.1:4488/';
 document.body.append(frame);
};
</script></html>`;

const server = serve({
  hostname: "127.0.0.1",
  port: 4497,
  fetch(request) {
    const path = new URL(request.url).pathname;
    if (path === "/redirect") return Response.redirect("http://127.0.0.1:4488/", 302);
    if (path === "/download") {
      return new Response("Synthetic native browser acceptance fixture", {
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Disposition": 'attachment; filename="synthetic.txt"',
        },
      });
    }
    return new Response(page, { headers: { "Content-Type": "text/html" } });
  },
});
await once(server, "listening");
const serverUrl = new URL(`http://127.0.0.1:${(server.address() as AddressInfo).port}/`);
console.log(`Native acceptance fixture: ${serverUrl}`);
