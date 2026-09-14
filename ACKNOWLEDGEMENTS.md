# Acknowledgements

Drawloom is built on the work of open-source maintainers, standards authors and
researchers. Credit is distinct from adoption, endorsement and licence compliance.
See [third-party notices](THIRD_PARTY_NOTICES.md), the [licence inventory](LICENSES/inventory.json)
and the repository's [Apache-2.0 licence](LICENSE).

## Implementation foundations

| Project | Contribution to Drawloom |
| --- | --- |
| [Bun](https://bun.sh), [Node.js](https://nodejs.org), [TypeScript](https://www.typescriptlang.org) | Toolchain and application/runtime foundations |
| [Svelte](https://svelte.dev), [shadcn-svelte](https://shadcn-svelte.com), [Bits UI](https://bits-ui.com), [Tailwind CSS](https://tailwindcss.com), [Lucide](https://lucide.dev) | Accessible presentation, components, styling and iconography |
| [Tauri](https://tauri.app) | Native desktop shell |
| [Zod](https://zod.dev) | Validated boundary schemas |
| [SQLite](https://sqlite.org), [sqlite-vec](https://github.com/asg017/sqlite-vec) | Local persistence and rebuildable vector indexes |
| [Temporal](https://temporal.io) | Durable orchestration |
| [OpenTelemetry](https://opentelemetry.io) | Standard observability APIs |
| [Braintrust](https://github.com/braintrustdata/braintrust-sdk), [Autoevals](https://github.com/braintrustdata/autoevals) | Evaluation implementation foundations |
| [llama.cpp](https://github.com/ggml-org/llama.cpp), [Qwen](https://github.com/QwenLM/Qwen3-Embedding) | Proposed native local embedding runtime and model |

The complete dependency inventory includes transitive components; this overview is
not an exhaustive authors list or a substitute for each component's legal text.
Copied shadcn-svelte components retain their original copyright and MIT licence.

## Standards and intellectual references

MCP and MCP Apps, NIST ABAC guidance, AuthZEN and OKF informed the boundaries.
DeepSeek Harness, Open Design, Codex and the researched knowledge/evaluation
systems informed comparisons rather than being implicitly incorporated or endorsed.
The [ADRs](docs/adr/README.md) and linked surveys record the exact decisions,
source revisions, alternatives and limitations. Prior MLX experiments remain
credited historical evidence; credit does not make their runtime a product dependency.

## Contributions

Repository history records Drawloom contributors. Contributions remain governed by
[CONTRIBUTING.md](CONTRIBUTING.md) and the DCO; no copyright assignment or external
project endorsement is implied by this acknowledgement.
