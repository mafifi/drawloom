---
step: 3
title: Investigations
question: How we looked into it
summary: How we learn from other projects before we build, and the projects we'd like to thank.
draft: false
---

Most problems Drawloom faces have been solved before. Before we build anything,
we look at how others solved them.

## How we investigate

1. **Find the best examples.** We look for open-source projects that solve the
   same problem, ideally in different ways.
2. **Read the code.** We study how they actually work, not just what their
   documentation says.
3. **Run a small experiment.** We try the idea in a separate prototype, called a
   spike, before it goes anywhere near Drawloom.
4. **Write down the decision.** We record what we chose and why, so anyone can
   check our reasoning. See [Decisions](/decisions/).

We've published our studies of agent harnesses and workbenches, knowledge and
memory, evaluation and access control.

## Thank you

Drawloom is built on work that other people chose to share. Thank you.

**What Drawloom runs on**

- [Temporal](https://temporal.io/): keeps long-running work going through crashes and restarts.
- [Tauri](https://tauri.app/): the Mac app itself.
- [Node.js](https://nodejs.org/) and [pnpm](https://pnpm.io/): run and package the app.
- [Svelte](https://svelte.dev/), [shadcn-svelte](https://www.shadcn-svelte.com/) and [Bits UI](https://bits-ui.com/): every screen.
- [Model Context Protocol](https://modelcontextprotocol.io/): connects agents to tools.
- [SQLite](https://sqlite.org/) and [sqlite-vec](https://github.com/asg017/sqlite-vec): storage and search, on your own computer.
- [Zod](https://zod.dev/): checks data wherever it enters.
- [Vitest](https://vitest.dev/) and [Biome](https://biomejs.dev/): testing and formatting.
- [Astro](https://astro.build/): this website.

**Agent harnesses and workbenches**

- [OpenAI Codex](https://github.com/openai/codex): the agent Drawloom works with today.
- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness): how to keep a full conversation history alongside a lighter view for the screen.
- [Open Design](https://github.com/nexu-io/open-design): how to build a rich product around agents you don't own.
- [MCP Apps](https://modelcontextprotocol.io/extensions/apps/overview): the standard Drawloom uses for plugin screens.

**Knowledge and memory**

- [Hindsight](https://github.com/vectorize-io/hindsight): keeping evidence separate from summaries.
- [Graphiti](https://github.com/getzep/graphiti): marking a fact as out of date without erasing it.
- [Letta Code](https://github.com/letta-ai/letta-code): knowing when work has safely finished.
- [Mem0](https://github.com/mem0ai/mem0): checking that every save actually worked.
- [A-Mem](https://github.com/agiresearch/A-mem): notes that update related notes.
- [HippoRAG](https://github.com/OSU-NLP-Group/HippoRAG): removing a source along with everything learned from it.
- [LongMemEval](https://github.com/xiaowu0162/LongMemEval): testing long-term memory.
- [Sleep-time Compute](https://github.com/letta-ai/sleep-time-compute): preparing context while the agent is idle.
- [MINJA](https://github.com/dsh3n77/MINJA): how shared memory can be attacked.
- [SEPIO](https://github.com/sepio-framework/sepio-linkml) and [W3C PROV-O](https://www.w3.org/TR/prov-o/): recording where a claim came from.

**Evaluation**

- [Promptfoo](https://github.com/promptfoo/promptfoo): running and comparing test cases locally.
- [Arcade MCP](https://github.com/ArcadeAI/arcade-mcp): testing whether an agent picks the right tool.
- [DeepEval](https://github.com/confident-ai/deepeval): measures for retrieval, agents and conversations.
- [Langfuse](https://github.com/langfuse/langfuse): comparisons, feedback and background evaluation.
- [Braintrust](https://github.com/braintrustdata/braintrust-sdk-javascript) and [Autoevals](https://github.com/braintrustdata/autoevals): the scoring Drawloom uses.
- [LangSmith](https://github.com/langchain-ai/langsmith-sdk): linking scores to what the agent actually did.

**Access control and monitoring**

- [NIST SP 800-162](https://csrc.nist.gov/pubs/sp/800/162/upd2/final): the model behind how Drawloom decides who sees what.
- [OpenID AuthZEN](https://openid.net/specs/authorization-api-1_0.html): a standard way to ask "is this allowed?".
- [Cedar](https://github.com/cedar-policy/cedar) and [Casbin](https://github.com/apache/casbin-node-casbin): policy engines we tested side by side.
- [OpenTelemetry](https://opentelemetry.io/docs/languages/js/): seeing what the agent did, without recording your conversations.
- [Archify](https://github.com/tt-a1i/archify): our architecture diagrams.

## Learn more

- [Our published studies](https://github.com/mafifi/drawloom/tree/main/docs/reference)
- [Our experiments](https://github.com/mafifi/drawloom/tree/main/spikes)
