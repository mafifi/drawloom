import net from "node:net";
import {
  AUTOEVALS_EXACT_MATCH_SCORER,
  createBraintrustAssessmentProvider,
} from "../dist/index.js";

const port = Number.parseInt(process.argv[2] ?? "", 10);
if (!Number.isSafeInteger(port)) throw new Error("A local denial probe port is required");
const denied = await new Promise((resolve, reject) => {
  const socket = net.connect(port, "127.0.0.1");
  socket.once("connect", () => reject(new Error("Network sandbox did not deny the probe")));
  socket.once("error", () => resolve(true));
});
const provider = createBraintrustAssessmentProvider();
const scorer = provider.scorers?.find((candidate) => candidate.id === AUTOEVALS_EXACT_MATCH_SCORER.id && candidate.revision === AUTOEVALS_EXACT_MATCH_SCORER.revision);
if (!scorer) throw new Error("Supported exact-match scorer is unavailable");
const result = await provider.assess(
  scorer,
  { input: null, output: { answer: 1 }, expected: { answer: 1 }, references: [] },
  { signal: new AbortController().signal, invocationId: "offline-proof", runId: "offline-proof", operationId: "offline-proof-operation" },
);
console.log(JSON.stringify({ kind: "result", denied, outcome: result.outcome, score: result.findings[0]?.score }));
