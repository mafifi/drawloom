# Replace a capability without rebuilding the desktop

This guide is for developers who want Drawloom to use a different learning service,
context formatter, access policy or approval presentation. Choose the implementation
in trusted startup code. People using the desktop keep the same conversation and
knowledge screens.

The interfaces described here are implemented under Accepted
[ADR 0028](../adr/0028-replaceable-learning-context-and-decisions.md).
The [verification record](../plans/0028-verification.md) records executed checks and
their limits. This page is not a release or compatibility claim.

## What can you replace?

| Capability | Your implementation supplies | Drawloom still owns |
| --- | --- | --- |
| Learning: memory and knowledge together | Contribution, search, evidence, export, availability and shutdown; optional curation and warmup | Shared screens, trusted callers, consent and access enforcement |
| Context assembly | Session instructions and turn input, assembled from admitted material | Resolving sources, conversation bindings, permissions and the original displayed user message |
| Knowledge preparation | Bounded references relevant to a request | Disclosure permission, deadlines, cancellation and honest failure feedback |
| Access decisions | An asynchronous allow, deny or failure result | Enforcing the answer, tool ownership, current grants and native agent controls |
| Approval presentation | Showing a native request and forwarding the person's chosen option | Request identity, native choices, response validation and cancellation |

These are not five independent databases or background services. Learning reuses
the existing knowledge records and interfaces. Context assembly may use knowledge
preparation, but either can be replaced independently. Approval presentation does
not replace access policy or the agent's own approval process.

Providers are not selected by a browser request, a plugin manifest or model output.
Restart the application after changing startup composition. Replacing a learning
provider does not automatically copy stored knowledge to it.

## Supply learning without a local installer

`LearningService`, exported from `@drawloom/knowledge/learning`, groups the existing
knowledge operations for use by the desktop. Implement `ingest`, `search`, `evidence`,
`export`, `status` and `close`. `close` releases owned resources; it must not delete
the user's retained knowledge.

The `capabilities` object declares optional curation and warmup. When offering one,
implement all of its operations. An absent capability is unsupported, not a method
the desktop should guess at by name. Return the defined outcomes so the shared
screens can distinguish unavailable, cancelled, paused and running work.

The public [`createDeterministicLearningService` example](../../packages/examples/replacement-examples/src/learning.ts)
uses bounded synthetic records in memory. It has no installer, model name, download
operation or curation worker. It demonstrates an alternative shape—not a durable
replacement for the default SQLite implementation. It requires a trusted subject
and an access-decision implementation; a provider declaration alone never grants
access.

Installation belongs to the default local implementation's separate setup surface.
An alternative learning service does not need to imitate Qwen, llama.cpp or
Nightloom to power the shared knowledge experience.

Supply the service and its processing declaration together. This is a startup
fragment: `service` implements `LearningService`, and `processing` describes what
that implementation actually does using `LearningProcessingDeclaration` from
`@drawloom/knowledge/consent`.

```ts
const app = await createDesktopApplication(dataDirectory, {
  knowledge: {
    service,
    declaration: processing,
    // context: referencePreparer, // optional, independently supplied
  },
});
```

Omit `knowledge` to use Drawloom's default local composition. It supplies the
SQLite-backed service, Nightloom, reference preparation and local setup together.
An alternative with no preparer still supports manual search and evidence inspection;
automatic references are unavailable rather than silently delegated to the local
store. The shared screens do not acquire an installer from the service. The desktop's
separate `knowledge.setup` option is only for a statically wired local setup surface.

Nightloom itself consumes the orchestration contract. The default desktop wires
that contract to Temporal, including worker startup and shutdown. Tests named
`learning-journey-orchestration.integration` and `nightloom-orchestration.integration` verify that concrete
integration and its recovery behavior; Temporal is not a learning-contract dependency.

### Keep the user's permission when processing stays within it

The host stores the feature preference separately from the permission to process
information. Your trusted startup declaration describes the purpose, data used,
destinations and processing boundaries. It does not grant permission by itself.

If a replacement stays within the previously approved scope, permission remains
valid. A new purpose, wider data use or new destination needs confirmation before
that processing starts. The saved preference and retained knowledge remain intact
while confirmation is pending. Turning a feature off stops new activity; it does
not erase information already sent in earlier turns.

Existing installations migrate from their established configuration. The default
journey includes local storage and embeddings **and** sending selected evidence to
Codex for conversation references and assessment. It must not be described as
local-only. When the previous scope cannot be established, Drawloom preserves the
preference but asks for confirmation. It records the migration date, not an
invented original consent date.

A deliberate **Run now** needs permission for that assessment. It does not need
to turn automatic curation on. The application keeps those two choices separate.
In Settings, saving a feature preference does not approve its processing. The
separate confirmation shows its purpose, information, destinations and boundaries.
After confirming a manual assessment, choose Run now again; confirmation does not
silently start it.

## Assemble context differently

`ContextAssembler`, exported from `@drawloom/context/assembly`, has two methods:

- **`session`** assembles admitted workbench instructions, skills and host guidance.
- **`turn`** assembles the current request, explicit selections, attachments and any
  prepared knowledge references.

The host has already resolved and admitted those inputs. An assembler should not
open files, search knowledge or grant access as a side effect of formatting them.
Keep reference material separate from instructions. Preserve the original user
text, attachment identities and selection identities in the result.

The public [`createSectionedContextAssembler` example](../../packages/examples/replacement-examples/src/index.ts)
formats these inputs differently from the default. This is an illustrative startup
fragment inside the desktop host, not a standalone application:

```ts
import { createSectionedContextAssembler } from "@drawloom/replacement-examples";
import { createDesktopApplication } from "./application.js";

const app = await createDesktopApplication(dataDirectory, {
  contextAssembler: createSectionedContextAssembler(),
});
// The composition that owns app must eventually call await app.close().
```

The narrower `ContextPreparer` still selects automatic knowledge references. It
does not assemble skills or instructions. Preparation shares a remaining-time
budget across search, evidence reads and access decisions. A timeout or failed
decision discards the automatic selection; it must not publish the checked prefix
of a partly checked result. Ordinary denial excludes the affected record.

A mandatory assembly failure prevents submission. Optional automatic knowledge
failure lets the request continue, with a limitation shown to the user. Provider
history and compaction remain the agent integration's responsibility.

## Supply access decisions

`Authorizer`, exported from `@drawloom/authorization`, has one promise-returning
`authorize(request, options)` method. The request contains the trusted subject,
action, resource and available context. The options carry cancellation and the
remaining operation budget; they are not user-supplied policy facts.

Select it with the desktop's `authorizer` startup option. This fragment assumes
`accessPolicy` is your `Authorizer` implementation, constructed by trusted setup:

```ts
const app = await createDesktopApplication(dataDirectory, {
  authorizer: accessPolicy,
});
```

The desktop applies its scheduler around that implementation. Do not add a second
scheduler inside a learning worker: it would create a separate capacity allowance
and could let background work compete with interactive requests.

The supervised local worker asks the host for decisions over its private process
connection. Each request belongs to admitted work and that worker's lifetime. The
worker does not load your policy implementation. Your policy can therefore be
replaced without changing the worker or granting it a separate source of authority.

Return `{ decision: true }` only when access is permitted. Return
`{ decision: false }` for a deliberate refusal. Return a structured failure when
the implementation cannot decide. A timeout, malformed result or exception is not
an ordinary refusal, and none permits the protected action.

Drawloom schedules decisions in separate foreground and background pools. Waiting
uses the caller's budget. An implementation that ignores cancellation continues to
occupy its active slot until it settles, rather than allowing timed-out work to
accumulate without limit.

The host checks whether relevant authority changed while awaiting a decision.
Tools also ask for a fresh decision after start evidence is recorded and before
execution. Do not remove that second decision just because a host generation is
unchanged: your policy may depend on facts the host cannot version.

The [local](../../packages/authorization/local-authorization/src/index.ts) and
[deterministic](../../packages/authorization/deterministic-authorization/src/index.ts)
implementations show the interface. The deterministic implementation is a test
consumer, not evidence that a third-party policy engine is compatible.

## Show approvals in another place

`ApprovalPresenter`, exported from `@drawloom/agent/approval-presentation`, receives
the native request, narrowly bound actions and a lifetime signal. Returning from
`present` means the request was displayed—not that it was approved.

The public `createInboxApprovalPresenter` example keeps pending requests for a
developer-owned inbox. Select it through the desktop's trusted `approvalPresenter`
startup option. Render the supplied option labels and pass the chosen `optionId`
to that request's `actions.choose`. Do not create replacement option identities.

```ts
import { createInboxApprovalPresenter } from "@drawloom/replacement-examples";

const approvals = createInboxApprovalPresenter();
const app = await createDesktopApplication(dataDirectory, {
  approvalPresenter: approvals,
});
// Your presentation reads approvals.pending() and renders those native choices.
```

This is a setup fragment, not a complete inbox UI. Keep the request's conversation
visible so someone can tell which work they are approving.

Dismissal sends no decision. Presentation failure is recoverable by showing the
same still-pending request again. Stop remains a separate action. On lifetime
cancellation, remove the old surface and stop using its callbacks. Native
completion or disconnection can invalidate a request without anyone answering it.

This does not turn an MCP form, an ordinary question or business acceptance into
an execution approval. Those continue to use their own interfaces.

## Verify the replacement

Use shared conformance before trying a replacement in the desktop. The context
suite is exported from `@drawloom/context/assembly-conformance`; access-decision
conformance is exported from `@drawloom/authorization/conformance`. The learning
suite is exported from `@drawloom/knowledge/learning-conformance`.
For approvals, use `@drawloom/agent/approval-conformance` with a test driver for
your presentation connected to its real host. The shared suite checks unanswered,
dismissed and failed requests, native choices, re-presentation and stale actions.
It does not replace a browser accessibility check or a native transport test.

Then test the product path: native requests and reopening history for context;
revocation and unattended assessment for policy; failed, dismissed and unanswered
requests for approval presentation. A passing type check alone does not prove these
behaviors.

After `pnpm run build:packages`, `pnpm run test:replacements` packages the built
public packages and installs their tarballs into a disposable consumer outside
the checkout, then uses their public exports under Node. It is a packaging and
contract check, not a live model or rendered UI test.
The application check separately builds a desktop artifact against those installed
public exports. It runs default/inbox approval conformance through synthetic native
requests and default local learning conformance through an installed Node worker.
The desktop artifact runs under Bun; portable consumers run under Node. Neither
requires a live model or a model download.
Use [CONTRIBUTING.md](../../CONTRIBUTING.md) for the repository's remaining checks.
