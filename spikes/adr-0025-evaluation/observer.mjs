// Observation only. OS sandboxing denies network; this never replaces a vendor
// request function. Events overlap and are not a count of unique requests.
import { channel } from 'node:diagnostics_channel';
import { appendFileSync } from 'node:fs';

const file = process.env.DRAWLOOM_EVAL_NETWORK_LOG;
if (!file) throw Error('Network observation log must be configured');
const counts = Object.create(null);
let events = 0;
for (const name of ['undici:request:create', 'http.client.request.created', 'net.client.socket']) {
  channel(name).subscribe(() => {
    counts[name] = (counts[name] ?? 0) + 1;
    if (events++ < 128) appendFileSync(file, JSON.stringify({kind:'event',channel:name})+'\n', {mode:0o600});
  });
}
process.once('exit', () => {
  appendFileSync(file, JSON.stringify({kind:'summary',counts,detailTruncated:events>128})+'\n', {mode:0o600});
});
