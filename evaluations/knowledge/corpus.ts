/** Public, invented facts. Never ingest private projects to run this evaluation. */
export interface EvaluationDocument {
  id: string;
  revision: string;
  text: string;
  current: boolean;
  evidence: readonly string[];
}
export interface EvaluationQuestion {
  id: string;
  kind: "semantic" | "identifier" | "chain" | "contradiction" | "irrelevant";
  query: string;
  relevant: readonly string[];
  requiredChain: readonly string[];
  expectedAnswer: string;
  abstain: boolean;
}
export const corpusVersion = "drawloom-public-knowledge-v1";
export const documents: readonly EvaluationDocument[] = [
  { id: "museum-access", revision: "r1", text: "The Lantern Museum has a step-free entrance on Willow Lane. The front entrance on Market Street has stairs.", current: true, evidence: [] },
  { id: "museum-hours", revision: "r1", text: "The Lantern Museum opens from 10:00 to 18:00 on Tuesday through Sunday. It is closed on Mondays.", current: true, evidence: [] },
  { id: "museum-visiting", revision: "r1", text: "A wheelchair user visiting the Lantern Museum should use Willow Lane and avoid Monday.", current: true, evidence: ["museum-access@r1", "museum-hours@r1"] },
  { id: "archive-policy", revision: "r1", text: "Harbour Archive retains original survey scans for seven years. Deleting a search index does not remove the originals.", current: true, evidence: [] },
  { id: "archive-recovery", revision: "r1", text: "Harbour Archive can rebuild its search index from retained original survey scans without collecting the surveys again.", current: true, evidence: ["archive-policy@r1"] },
  { id: "rail-closure", revision: "r1", text: "Bridge repairs close the northbound Amber Line from 3 to 9 April. A replacement bus leaves from Orchard Square.", current: true, evidence: [] },
  { id: "rail-cycle", revision: "r1", text: "The Amber Line replacement bus cannot carry bicycles. Folded pushchairs are accepted.", current: true, evidence: [] },
  { id: "rail-travel", revision: "r1", text: "During the April bridge repairs, cyclists cannot take their bicycles on the Amber Line replacement bus.", current: true, evidence: ["rail-closure@r1", "rail-cycle@r1"] },
  { id: "garden-water", revision: "r1", text: "Cedar community garden collects rainwater in covered tanks. Mains water is used only when stored rainwater is exhausted.", current: true, evidence: [] },
  { id: "garden-access", revision: "r1", text: "Cedar community garden members may borrow hand tools. Powered equipment requires a completed induction.", current: true, evidence: [] },
  { id: "book-binding", revision: "r1", text: "Paperfinch books use sewn signatures so pages lie flat when opened. Their cloth covers can be replaced without replacing the printed pages.", current: true, evidence: [] },
  { id: "book-repair", revision: "r1", text: "A damaged cloth cover on a Paperfinch book does not require reprinting its contents.", current: true, evidence: ["book-binding@r1"] },
  { id: "release-retry", revision: "r1", text: "Release LANTERN-042 disables automatic retry after an uncertain payment response. Operators first inspect the original payment operation.", current: true, evidence: [] },
  { id: "release-cache", revision: "r1", text: "Release LANTERN-024 caches completed thumbnail work. It does not change payment handling.", current: true, evidence: [] },
  { id: "export-profile", revision: "r1", text: "Profile OAK-17 exports 1920 by 1080 frames at 24 frames per second with a 48 kHz audio track.", current: true, evidence: [] },
  { id: "export-other", revision: "r1", text: "Profile OAK-71 exports square 1080 by 1080 frames at 30 frames per second. It is separate from OAK-17.", current: true, evidence: [] },
  { id: "ferry-rule", revision: "r1", text: "The Rowan ferry accepted cash fares only until 1 June.", current: false, evidence: [] },
  { id: "ferry-rule", revision: "r2", text: "Since 1 June the Rowan ferry accepts contactless cards and cash. The operator replaced the earlier cash-only rule.", current: true, evidence: ["ferry-rule@r1"] },
  { id: "ferry-guidance", revision: "r1", text: "A traveller can now pay for the Rowan ferry with a contactless card; cash-only advice is outdated.", current: true, evidence: ["ferry-rule@r2", "ferry-rule@r1"] },
  { id: "package-report", revision: "r1", text: "One report described the Kestrel parcel locker as unavailable on a Sunday. The report did not establish a weekly pattern.", current: true, evidence: [] },
  { id: "package-status", revision: "r1", text: "The Kestrel operator recorded successful parcel collections on the following three Sundays. It reported no regular Sunday shutdown.", current: true, evidence: [] },
  { id: "package-claim", revision: "r1", text: "Evidence does not support a regular Sunday shutdown of the Kestrel parcel locker. A single failure report is contradicted by later successful collections.", current: true, evidence: ["package-report@r1", "package-status@r1"] },
  { id: "observatory-rule", revision: "r1", text: "Visitors to Birch Observatory must reserve a ticket. A reservation alone does not guarantee telescope viewing: cloud cover can prevent it.", current: true, evidence: [] },
  { id: "workshop-storage", revision: "r1", text: "The Larch workshop stores varnish in its ventilated cabinet, apart from the shelf for clean paintbrushes.", current: true, evidence: [] },
];

function question(id: string, kind: EvaluationQuestion["kind"], query: string, relevant: string[], expectedAnswer: string, requiredChain: string[] = []): EvaluationQuestion {
  return { id, kind, query, relevant, requiredChain, expectedAnswer, abstain: kind === "irrelevant" };
}
/** Freeze these questions before inspecting retrieval scores; do not tune on them. */
export const heldOutQuestions: readonly EvaluationQuestion[] = [
  question("s1", "semantic", "Where can someone using a mobility chair enter the exhibition building?", ["museum-access@r1", "museum-visiting@r1"], "Willow Lane is step-free."),
  question("s2", "semantic", "Can I visit Lantern at the beginning of the working week?", ["museum-hours@r1", "museum-visiting@r1"], "It is closed Monday; opens Tuesday."),
  question("s3", "semantic", "Do we need to gather all the old surveys again if their lookup catalogue is lost?", ["archive-recovery@r1", "archive-policy@r1"], "No, rebuild from retained original scans."),
  question("s4", "semantic", "How do northbound passengers travel while the bridge is being fixed?", ["rail-closure@r1"], "Replacement bus from Orchard Square, 3–9 April."),
  question("s5", "semantic", "Will the substitute service let me bring my bike?", ["rail-cycle@r1", "rail-travel@r1"], "The replacement bus cannot carry bicycles."),
  question("s6", "semantic", "What do Cedar growers irrigate with before turning on the tap?", ["garden-water@r1"], "Stored rainwater."),
  question("s7", "semantic", "Can a new garden member immediately borrow an electric cutter?", ["garden-access@r1"], "Powered equipment needs a completed induction."),
  question("s8", "semantic", "Must the whole volume be printed again when its fabric jacket wears out?", ["book-repair@r1", "book-binding@r1"], "No, the cloth cover is replaceable."),
  question("s9", "semantic", "Should an unclear charge response lead to another attempt immediately?", ["release-retry@r1"], "No, inspect the original payment operation first."),
  question("s10", "semantic", "Does booking a place promise a view through the instrument at Birch?", ["observatory-rule@r1"], "No, clouds may prevent telescope viewing."),
  question("s11", "semantic", "Where does Larch keep the liquid used to finish wood?", ["workshop-storage@r1"], "The ventilated varnish cabinet."),
  question("i1", "identifier", "What changed in LANTERN-042?", ["release-retry@r1"], "No automatic retry of uncertain payments."),
  question("i2", "identifier", "What changed in LANTERN-024?", ["release-cache@r1"], "Completed thumbnails are cached."),
  question("i3", "identifier", "What is OAK-17's frame rate?", ["export-profile@r1"], "24 frames per second."),
  question("i4", "identifier", "What dimensions does OAK-71 produce?", ["export-other@r1"], "1080 by 1080."),
  question("c1", "chain", "Plan an accessible Lantern visit and show the evidence for both timing and entrance.", ["museum-visiting@r1"], "Willow Lane; Tuesday–Sunday, 10:00–18:00.", ["museum-visiting@r1", "museum-access@r1", "museum-hours@r1"]),
  question("c2", "chain", "Explain why the April replacement journey is unsuitable for a cyclist bringing a bicycle.", ["rail-travel@r1"], "Bridge repairs mean a bus replacement which does not carry bicycles.", ["rail-travel@r1", "rail-closure@r1", "rail-cycle@r1"]),
  question("c3", "chain", "Explain why Paperfinch repair does not require reprinting.", ["book-repair@r1"], "Its cloth cover is replaceable separately from printed pages.", ["book-repair@r1", "book-binding@r1"]),
  question("x1", "contradiction", "Is the Rowan ferry still cash-only?", ["ferry-rule@r2", "ferry-guidance@r1"], "No, contactless cards have been accepted since 1 June.", ["ferry-rule@r1", "ferry-rule@r2"]),
  question("x2", "contradiction", "Should I assume the Kestrel locker is always closed on Sunday?", ["package-claim@r1", "package-status@r1"], "No, later successful Sunday collections contradict that assumption.", ["package-claim@r1", "package-report@r1", "package-status@r1"]),
  question("n1", "irrelevant", "How much is a ticket to Birch Observatory?", [], "The evidence does not state a price."),
  question("n2", "irrelevant", "Who designed the Lantern Museum?", [], "The evidence does not identify an architect."),
  question("n3", "irrelevant", "Which card processor does Rowan ferry use?", [], "The evidence does not name a processor."),
  question("n4", "irrelevant", "What will the weather be at Birch tomorrow?", [], "The evidence does not contain a forecast."),
];

/** Streaming generator: stress volume never requires allocating the entire corpus. */
export function* corpusAtSize(size: number): Generator<EvaluationDocument> {
  if (!Number.isSafeInteger(size) || size < documents.length) throw new Error("Invalid corpus size");
  yield* documents;
  for (let index = documents.length; index < size; index += 1) {
    yield { id: `inventory-${index}`, revision: "r1", text: `Public inventory ${index}: sample box ${index % 101} contains ${index % 29} ceramic tiles. Storage aisle ${index % 17}. This entry records no transport, museum, payment, garden or software policy.`, current: true, evidence: [] };
  }
}
