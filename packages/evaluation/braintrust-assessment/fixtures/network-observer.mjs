// Observation only. The operating-system sandbox is the network boundary.
import { channel } from "node:diagnostics_channel";
import { appendFileSync } from "node:fs";

const file = process.env.DRAWLOOM_ASSESSMENT_NETWORK_LOG;
if (!file) throw new Error("Assessment network observation log is required");
const counts = Object.create(null);
for (const name of ["undici:request:create", "http.client.request.created", "net.client.socket"]) {
  channel(name).subscribe(() => { counts[name] = (counts[name] ?? 0) + 1; });
}
process.once("exit", () => appendFileSync(file, `${JSON.stringify(counts)}\n`, { mode: 0o600 }));
