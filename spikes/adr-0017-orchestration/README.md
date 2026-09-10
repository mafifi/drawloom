# ADR 0017 orchestration proof

Retained, public, synthetic architectural evidence—not a supported runtime.
[ADR 0017](../../docs/adr/0017-orchestration-interfaces.md) is **Accepted** for the
demonstrated contract, not a production backend or supported implementation.
Read the [candidate API](../../docs/design/orchestration-contract.md) and
[authoritative evidence](../../knowledge/evidence/adr-0017-orchestration.md)
before treating a passing test as a guarantee.

## Map

- `contract.ts`: schema-backed definitions, workflow context and management API.
- `owned-agent.ts`: portable helper using existing agent input/resolution schemas.
- `fixtures.ts`: registered public synthetic workflows and task declarations.
- `memory.ts`: ephemeral conformance implementation, not another durable engine.
- `conformance.ts`: shared Node-compatible assertion suite.
- `agent-bridge.ts` / `agent-task-host.ts`: existing-driver coordination and
  authority-preserving host dispatch. No workflow or transcript replay into a model.
- `temporal.ts` / `temporal-workflow.ts`: native management and durable execution
  of the same registered definitions.
- `temporal-worker.ts` / `temporal-run.ts`: Node worker and opt-in local proof,
  including worker/service restart, counts and an independent synthetic bridge.

Run deterministic checks from the repository root:

```sh
bun test spikes/adr-0017-orchestration
bun run check:types
bun run check:architecture
```

The canonical gate includes these tests without requiring Temporal, credentials,
the private repository, or a model. The separate portable configuration excludes
Bun/Node ambient APIs; the architecture rule also prevents Temporal and host
handler imports from authoring files. Supported packages cannot import this spike.

Run the opt-in local Temporal proof from the repository root:

```sh
bun run spike:adr-0017
```

This builds the public packages and Node runner, starts only local test services
and shuts down its owned child processes. It requires the installed Temporal CLI
and a compatible Node runtime; it does not install or upgrade either globally.
See the evidence record for exact tested versions and run outcomes.

## Runtime boundaries

Temporal's TypeScript worker uses Node, not Bun. Bun installs pinned development
dependencies and builds the runner. A loopback development service and its local
SQLite database exist only for the opt-in proof. This is not a production server
installation, default backend selection, workflow-upgrade test or cloud deployment.

`tsconfig.temporal.json` skips checking external declaration files because SDK
1.23.0's schedule-client declaration rejects `exactOptionalPropertyTypes` under
TypeScript 5.9.3 (TS2344). Adapter source remains strict with that option enabled.
The portable contract configuration and normal repository configuration retain
full declaration checking. This exception is not a supported-package relaxation.

Agent bridge receipts are separate from the workflow engine. The current accepted
agent contract does not provide general reattachment to an unknown operation.
Worker/service restart with a surviving bridge must not be described as recovery
from loss of that bridge or as live Codex continuity. Where reconciliation cannot
establish the outcome, it is unknown and must not be automatically resubmitted.
