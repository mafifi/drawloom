# Treatment Episode diagram candidates

These two architecture candidates explain the existing Dr Souphi system. They
do not describe an implemented Drawloom runtime. They are local editorial
candidates, not approved publication material.

Verified read-only against `/Users/afifim/Development/projects` at revision
`4debe2fef203c974849bb9551d34360e8d860dd5` on 2026-09-05. This is a source
inspection, not a production execution or a claim about current deployed state.
Paths and line numbers below are relative to that repository. No private code
excerpts, credentials, account identifiers, request payloads or source URLs are
embedded in the delivered diagrams.

## Candidate purpose

- `ownership.architecture.json`: eight selected responsibilities and their
  execution crossings. The strongest article candidate for explaining why the
  work grows beyond generating content.
- `providers.architecture.json`: six components showing the actual split among
  gateway-routed OpenAI, direct Vertex, and Modal services. Useful as the
  technical companion to the first candidate.

## Verified evidence

| Diagram fact | Source evidence |
| --- | --- |
| Marketing owns production commands and accepted selections. | `packages/convex-marketing/src/convex/marketing/treatmentEpisode/commands.ts:3320–3372`; `packages/backend-souphi/convex/treatmentEpisode/AGENTS.md:5–29` |
| Marketing derives a capability ceiling, checks the episode reservation ceiling, and inserts permission plus the exact Agentic attempt in one transaction. | `packages/convex-marketing/src/convex/marketing/treatmentEpisode/commands.ts:3386–3490` |
| The shared retry adapter is a real part of this Episode path. Marketing chooses the Agentic or Render dispatcher and passes the attempt identity plus host transport handle. | `packages/convex-marketing/src/convex/marketing/treatmentEpisode/commands.ts:126–164` |
| Substrate adapts the installed Action Retrier by creating a function handle and starting the component with the retained arguments. | `packages/convex-substrate/src/action_retrier.ts:128–156` |
| Agentic reads its attempt and calls the injected host transport; result finalisation is an injected mutation. | `packages/convex-agentic/src/convex/capabilityAttempts/dispatchAction.ts:25–73` |
| Dispatch identity is recorded before transport invocation. A thrown submission becomes unknown; successful transport data is parsed separately. | `packages/convex-agentic/src/convex/capabilityAttempts/dispatch.ts:132–189` |
| A known, pending provider operation is settled through its stored provider identity. Pending and proven pre-network failures trigger the shared retry mechanism. | `packages/convex-agentic/src/convex/capabilityAttempts/dispatch.ts:192–213`; `packages/convex-agentic/src/convex/capabilityAttempts/dispatch.ts:244–285` |
| Unknown submission requires a proven submitted/not-submitted resolution on the existing attempt. | `packages/convex-agentic/src/convex/capabilityAttempts/runtime.ts:280–319` |
| Host text calls use OpenAI Responses through Cloudflare AI Gateway. | `packages/backend-souphi/convex/treatmentEpisode/structuredTextCapability.ts:440–461`; `packages/backend-souphi/convex/treatmentEpisode/structuredTextCapability.ts:500–507` |
| Host image calls use Cloudflare AI Gateway's provider-native image endpoints; the request compiler names gpt-image-2. | `packages/backend-souphi/convex/treatmentEpisode/transportProviders.ts:63–125`; `packages/common/marketing/application/treatment-episode/TreatmentEpisodePromptCompiler.ts:263` |
| Endpoint motion uses Veo 3.1 and direct Google Vertex submission/operation endpoints. | `packages/backend-souphi/convex/treatmentEpisode/vertexMotionCapability.ts:23–52` |
| Narration submits to Modal, then looks up a known call; the requested engine is Higgs TTS 3. | `packages/backend-souphi/convex/treatmentEpisode/narrationCapability.ts:99–145`; `packages/backend-souphi/convex/treatmentEpisode/narrationCapability.ts:340–389` |
| Deterministic media dispatch and lookup use the shared Render provider facade and configured Modal renderer. | `packages/backend-souphi/convex/treatmentEpisode/transport.ts:174–204`; `apps/laifu-nini-renderer-modal/deterministic_media.py:1`; `apps/laifu-nini-renderer-modal/deterministic_media.py:435` |
| Host media I/O uses Assets upload/finalise boundaries and verifies immutable bytes. | `packages/backend-souphi/convex/treatmentEpisode/transport.ts:36–88`; `packages/backend-souphi/convex/treatmentEpisode/hostAssetIO.ts:14–36` |
| D1/E1/F1 infographic transitions use deterministic Render attempts, with no generative endpoint-motion purchase. | `packages/convex-marketing/src/convex/marketing/treatmentEpisode/AGENTS.md:34–43`; `packages/common/marketing/domain/treatment-episode/TreatmentEpisodeProgramme.ts:557–568` |
| Final video acceptance is separate from publication approval. The accepted video is adopted into the existing marketing publication path. | `packages/convex-marketing/src/convex/marketing/treatmentEpisode/AGENTS.md:113–121` |

## Deliberate boundaries

The ownership arrows show selected calls and custody relationships, not every
request or return. The direct parent-to-child creation transaction is explained
in a card; the main spine shows the later dispatch path. Result callbacks,
Marketing finalisation, acceptance reads and social publication are omitted
from the arrows to keep this candidate readable.

Substrate is shown for its Action Retrier adapter. Its other Workflow/Workpool
adapters are not implied to sit in this Treatment Episode path. The retry node
uses Archify's message-bus visual category for durable execution, not as a
claim that the application owns a separate message broker.

The provider map combines text and images at their shared gateway and provider,
while preserving their distinct endpoint wording. Modal narration and
deterministic rendering are separate service routes, not one synthetic endpoint.
The spend ceiling is a reservation ceiling derived from immutable authorities;
it is not measured billing, a live account balance, or proof of a free renderer.
Provider success, a sealed Artifact, an accepted production step and publication
approval are distinct facts.

## Reproduction and verification

Archify 2.17 was read from a one-off local clone at
`/tmp/drawloom-archify-YQaFgE/source/archify`; it was not installed or added as a
Drawloom dependency. Its update checker ran with updates disabled. No brands
were fetched. The source candidates use the architecture schema, English locale,
static default motion and the default Classic visual preset.

Generated files are outside source history at
`/Users/afifim/.codex/visualizations/2026/09/02/01a06218-f36c-7660-9fde-633b4b5b7215/treatment-architecture/`.

Both candidates passed `validate architecture --quality showcase --json` and
atomic `deliver architecture --quality showcase --json`: 9/9 checks, zero
composition errors and zero warnings. The exact delivery digests are retained
in `delivery-receipts.json` in the generated-output directory.

`visual-check` passed for both exact HTML artifacts. It measured first-screen
containment at 1440×900, 1600×1000, 1920×1080 and 2048×1320, then captured light
and dark at the smallest and largest sizes. Each artifact has a `.visual-check.json`
receipt, four PNG captures and a `.visual-check.html` contact sheet. Automated
receipts correctly leave perceptual review pending.

An image-capable reviewer separately inspected all eight captures: node and
card copy fit, routes remained distinct, labels did not mask unrelated routes,
and the full-height composition remained balanced in both themes. Perceptual
review passed for these candidate diagrams. Search, focus, passport and export
interactions were not manually exercised; no claim about those interactions is
made. Ownership used two focused correction rounds; providers used one. No
candidate was edited after its final passing validation and delivery.
