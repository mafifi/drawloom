---
step: 3
title: Investigations
question: How we looked into it
summary: Before building each part of Drawloom, we studied how open projects solved the same problem, read their code, ran small experiments, then decided.
draft: false
---

Most of the problems Drawloom faces have already been met by someone else. This step shows how we learned from that work before writing our own, and how we kept track of what we actually know. It is also where we thank the projects that taught us.

## The method

The routine is the same for each capability.

1. **Start with an open question**, such as those in the [questions](/questions/) step.
2. **Find people who have solved it**, ideally more than one project that chose differently.
3. **Read their actual code.** Each survey names the exact version we read, so anyone can check our claims against the same lines.
4. **Try the idea in a small, separate experiment**, called a spike, which then stays on record as evidence.
5. **Decide, and write it down** in a decision record (see [decisions](/decisions/)).

Our architecture principles back this up with a simple test. Before adding complexity, we ask which real need requires it, what the smallest change would be, and how a test, spike or measurement will show it was worth the cost.

## Two references for every plugin change

A plugin is a package that adds a workbench, tools or other contributions to Drawloom. For changes to how plugins connect, we compare two reference points before building anything. One is Rosalind, a workbench plugin for OpenAI's Codex. The other is DeepSeek Harness, a public agent runtime with its own host application.

They often differ, and that is the useful part. Rosalind serves its screen as a web page through MCP Apps, an open standard for tool-provided interfaces. DeepSeek loads interface code straight into its host. Drawloom chose the MCP Apps standard. It used DeepSeek's way of declaring contributions as a reference, but left out its service registry and hot reloading.

When the two references differ, or a proposal departs from both, the contributor stops and brings the maintainer the example, the evidence and the smallest alternative. A working demo is not approval.

## Five surveys

- **Harness and workbench.** How DeepSeek Harness and Open Design handle conversation history, delivered files, plugins and their hosts. The short version: DeepSeek owns its agent runtime; Open Design builds a rich product around agents it does not own.
- **Knowledge and memory.** Eight systems compared across one lifecycle: what gets captured, how older material is corrected, and how results reach the agent. No common algorithm emerged. A clear lesson did: "the source was read", "a summary was saved" and "everything built on it is current" are three different facts.
- **Evaluation.** Seven evaluation tools, sorted by the jobs they actually do: assessing a finished result, running an experiment, or comparing versions. As the survey puts it, a score is not permission.
- **Authorization.** Two public standards and two policy engines, tried in a small local experiment on deciding who may read or change stored knowledge.
- **Our own code.** A guided walk through Drawloom itself, which warns that clicking a diagram node does not mean its files have been reviewed.

## Being honest about what research proves

The surveys state their own limits, and they matter.

**Reading code is not running it.** The harness survey read representative tests to understand intended behaviour, but ran no upstream application, provider call, test suite or build. The evaluation survey ran no vendor services or models, and says plainly that source-inspected behaviour is not integration proof.

**Old notes go stale.** Before finishing the harness survey, we updated both reference projects. DeepSeek Harness had gained 1,477 commits since our previous copy, and several earlier descriptions needed correcting. The memory survey found similar changes: Letta's main repository now points to Letta Code, and Mem0's current open-source path adds new facts without automatically reconciling them with old ones.

**Following a standard's shape is not certification.** Our authorization boundary uses the model from NIST SP 800-162 and the request shape of OpenID AuthZEN. The decision record says it proves neither NIST compliance nor full AuthZEN conformance.

**A small measurement is not a verdict.** Casbin beat Cedar on a tiny, unoptimised speed probe; the survey notes that speed alone does not select the engine.

**Only public code.** No private business code, prompts or data were copied into the surveys.

## Spikes: experiments kept apart

Spikes live in their own folder, outside the product. An automatic check rejects any product code that imports from them.

A passing spike is evidence for review. It does not accept a decision or allow its code to be copied into the product.

The first memory spike shows the tone. Seven fresh Codex conversations captured an observation, maintained a note about it, recalled it later, and revised it when contrary evidence arrived. The record says what this showed and also what it did not: it does not show that tasks got done better. When the evidence was thin, the agent declined to infer a pattern, which was the right answer.

## Thank you

Drawloom stands on work that other people chose to share. Naming a project here describes what we learned from it. It is not an endorsement by them or a claim that we match their behaviour.

**What Drawloom is built on**

Some projects we learned from. Others Drawloom runs on every day. It reuses these open-source projects rather than rebuilding what they already do well.

- [Temporal](https://temporal.io/): keeps long-running work going through crashes and restarts.
- [Tauri](https://tauri.app/): the native shell of the Mac app.
- [Node.js](https://nodejs.org/) and [pnpm](https://pnpm.io/): run the app and assemble what it ships.
- [Svelte](https://svelte.dev/), [shadcn-svelte](https://www.shadcn-svelte.com/) and [Bits UI](https://bits-ui.com/): the building blocks of every screen.
- [Model Context Protocol](https://modelcontextprotocol.io/): the open standard that connects agents to tools.
- [SQLite](https://sqlite.org/) and [sqlite-vec](https://github.com/asg017/sqlite-vec): local storage, and search by meaning, on your own machine.
- [Zod](https://zod.dev/): checks every piece of data where it enters.
- [Vitest](https://vitest.dev/) and [Biome](https://biomejs.dev/): the tests and formatting behind every change.
- [Astro](https://astro.build/): this website.

**Harness and workbench**

- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness): showed us how to keep full conversation history separate from the lighter views a screen needs.
- [Open Design](https://github.com/nexu-io/open-design): taught us that an app conversation, a run and the provider's own session are different things.
- Rosalind (OpenAI): our benchmark for rich plugin screens, and a clear example of where a vendor adds private extensions to a standard.
- [OpenAI Codex](https://github.com/openai/codex/blob/rust-v0.153.4/codex-rs/app-server/README.md): the agent Drawloom works with; we read its source to learn how its App Server and tool calls actually behave.
- [MCP Apps](https://modelcontextprotocol.io/extensions/apps/overview): the open standard Drawloom uses for plugin screens.

**Knowledge and memory**

- [Hindsight](https://github.com/vectorize-io/hindsight): the closest model for keeping evidence separate from background summaries.
- [Graphiti](https://github.com/getzep/graphiti): showed how to mark an old fact as no longer true without erasing it.
- [Letta Code](https://github.com/letta-ai/letta-code): showed a clear checkpoint for work that has safely finished.
- [Mem0](https://github.com/mem0ai/mem0): a reminder that a successful-looking reply does not prove every write succeeded.
- [A-Mem](https://github.com/agiresearch/A-mem): showed notes that reshape their neighbours, and the gap between a research idea and a durable service.
- [HippoRAG](https://github.com/OSU-NLP-Group/HippoRAG): showed how to remove a source along with what was derived from it.
- [LongMemEval](https://github.com/xiaowu0162/LongMemEval): a benchmark that helped us think about testing long-term memory.
- [Sleep-time Compute](https://github.com/letta-ai/sleep-time-compute): research on using quiet time between requests to prepare context in advance.
- [MINJA](https://github.com/dsh3n77/MINJA): security research showing shared memory can be poisoned through ordinary questions.
- [SEPIO](https://github.com/sepio-framework/sepio-linkml) and [W3C PROV-O](https://www.w3.org/TR/prov-o/): vocabulary for saying where a claim came from, without implying it is true.

**Evaluation**

- [Promptfoo](https://github.com/promptfoo/promptfoo): a local model for running and comparing test cases.
- [Arcade MCP](https://github.com/ArcadeAI/arcade-mcp): showed how to test whether an agent picks the right tool, which is different from testing what the tool did.
- [DeepEval](https://github.com/confident-ai/deepeval): a rich set of measures for retrieval, agents and conversations.
- [Langfuse](https://github.com/langfuse/langfuse): a reference for how a full platform handles comparisons, feedback and background evaluation.
- [Braintrust JavaScript SDK](https://github.com/braintrustdata/braintrust-sdk-javascript) and [Autoevals](https://github.com/braintrustdata/autoevals): small, function-shaped runners and scorers.
- [LangSmith SDK](https://github.com/langchain-ai/langsmith-sdk): showed evaluation linked to the record of what the agent did.

**Authorization and operations**

- [NIST SP 800-162](https://csrc.nist.gov/pubs/sp/800/162/upd2/final): separating the decision about access from enforcing it.
- [OpenID AuthZEN](https://openid.net/specs/authorization-api-1_0.html): a standard way to ask "may this person do this?", so policy engines can be swapped.
- [Cedar](https://github.com/cedar-policy/cedar) and [node-Casbin](https://github.com/apache/casbin-node-casbin): two working policy engines we tested side by side.
- [OpenTelemetry](https://opentelemetry.io/docs/languages/js/): standard tracing, so you can see what the agent did without turning diagnostics into a transcript store.
- [Archify](https://github.com/tt-a1i/archify): drew the architecture maps in our surveys.

## Go deeper

- [Reference-led changes and approval](https://github.com/mafifi/drawloom/blob/main/CONTRIBUTING.md#reference-led-changes-and-approval)
- [Harness and workbench survey](https://github.com/mafifi/drawloom/blob/main/docs/reference/harness-workbench-survey/README.md)
- [Knowledge and memory survey](https://github.com/mafifi/drawloom/blob/main/docs/reference/knowledge-memory-survey/README.md)
- [Evaluation survey](https://github.com/mafifi/drawloom/blob/main/docs/reference/evaluation-survey/README.md)
- [Authorization survey](https://github.com/mafifi/drawloom/blob/main/docs/reference/authorization-survey/README.md)
- [Walk through the Drawloom code](https://github.com/mafifi/drawloom/blob/main/docs/reference/repository-audit/README.md)
- [Retained spikes](https://github.com/mafifi/drawloom/blob/main/spikes/README.md)
- [ADR 0013: plugin boundaries and the two references](https://github.com/mafifi/drawloom/blob/main/docs/adr/0013-plugin-boundaries-and-host-integration.md)
- [First memory sprint](https://github.com/mafifi/drawloom/blob/main/knowledge/evidence/adr-0022-memory-sprint.md)
