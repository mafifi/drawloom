---
step: 6
title: Working code
question: The result
summary: Try the early Mac preview with your own Codex account, or build with the toolkit and replace the parts you need.
draft: false
---

The earlier steps show how Drawloom was designed. This one is the result: an app
you can install today and a toolkit you can build on. There are two paths below,
one for people who want to use the app and one for developers.

## Use the app

Drawloom's desktop app brings your projects, conversations with an AI agent and
their results into one place. It is an early preview. Expect rough edges, and
please tell us what you find by
[opening an issue](https://github.com/mafifi/drawloom/issues).

### What you need

- A Mac with Apple silicon, running macOS 14 or later.
- [Codex](https://developers.openai.com/codex), OpenAI's coding agent, installed
  and signed in.

Drawloom itself is free. It works with your own Codex account, so any Codex use
goes through your own OpenAI account. You can open the app without Codex, but it
will not pretend to do work without it. If Codex is unavailable, Drawloom does
not quietly swap in a made-up response.

### Install it

1. Download `Drawloom-0.0.0-preview.1-arm64.dmg` from the
   [preview release](https://github.com/mafifi/drawloom/releases/tag/v0.0.0-preview.1).
2. Open the disk image and drag Drawloom to Applications.
3. Open Drawloom.

The app is signed and notarised by Apple, which means Apple has checked it before
macOS lets it run. If you install Codex while Drawloom is open, quit and reopen
Drawloom so it can find it. Drawloom looks for Codex in the usual install
folders. If you installed Codex somewhere unusual, for example through a Node
version manager, Drawloom finds it only when started from a terminal that can
already see it.

Drawloom keeps its own records in `~/.drawloom`: your conversation records,
installed plugins and saved assets. Your project folders stay where they are.
They hold your working files, not the app's data.

### What you can do

- **Start work deliberately.** Add a project, choose a workbench and create a
  conversation. Picking a project or workbench on its own does not start the
  agent. Each conversation stays tied to the project and workbench it began with.
- **Direct the agent.** Send a request with selected material and images. While
  Codex works, you can keep drafting, steer supported work or stop it.
- **Decide how much to review.** Choose **Ask me** to approve actions yourself,
  or **Approve for me** where Codex's own review is available. Either way,
  Drawloom's separate tool permissions still apply, and nothing counts as
  finished until you accept it.
- **Look at the results.** Open result cards to inspect what was made. Audio,
  video, PDFs and text files have viewers. What you can edit or compare depends
  on the workbench.
- **Find past work.** Search conversation titles and messages, and rename,
  archive or restore conversations without deleting their history.
- **Add plugins.** Install a plugin package to bring in new skills and tools.

### What has not been checked yet

Our [release record](https://github.com/mafifi/drawloom/blob/main/knowledge/evidence/adr-0034-notarised-release.md)
is honest about its limits. On a clean test Mac, the signed app installed,
passed Apple's checks and launched. Some steps have not yet been run there from
a normal desktop session. These include a first launch from a fresh download
and a real Codex conversation from an app opened in the Dock. Signing and
notarisation are manual steps; no automated CI job builds the Mac app.

## Build with the toolkit

Drawloom is a free, open-source toolkit under the
[Apache License 2.0](https://github.com/mafifi/drawloom/blob/main/LICENSE).
It gives you the 10 capabilities an AI workbench needs: Context, Tools, Memory,
Knowledge, Evaluation, Orchestration, Sandbox, Observability, Agent integration,
and Policy and approval. The [README](https://github.com/mafifi/drawloom/blob/main/README.md#core-capabilities)
explains each one in a sentence.

Each capability sits behind an interface: a written promise about what a part
accepts, returns and does. Drawloom calls this a contract. You can use the
built-in implementation or supply your own. You choose which one to use once,
when the application starts, and the rest of the code keeps working.

These capabilities are not ten separate services. Memory builds on Knowledge's
interfaces. Sandboxing comes from the agent's own execution environment. There
is no general model-calling API. The
[foundation API guide](https://github.com/mafifi/drawloom/blob/main/docs/reference/foundation-api.md)
maps each task to the interface you need.

### Build from source

The repository pins its tools exactly: the pnpm and Node versions, plus the Rust
toolchain for the Mac app. From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm run check:ci
```

`check:ci` is the full gate. It checks formatting, documentation links,
dependency and licence policy, types and tests. To run the app from source, see
the [desktop setup guide](https://github.com/mafifi/drawloom/blob/main/apps/desktop/README.md).
You can run its interface in your browser or build the Mac app.

### Replace a capability

Today you can swap five parts without rebuilding the desktop: the learning
service (memory and knowledge together), how context is assembled, how knowledge
is prepared for a request, access decisions, and where approval requests are
shown. You pass your version to the desktop's startup code. Drawloom keeps what
protects the user: enforcing decisions, checking permission and keeping the
shared screens the same.

Each interface has shared tests, called conformance tests. They check that every
implementation keeps the same promises. Run them against your replacement before
trying it in the app. The
[replacement guide](https://github.com/mafifi/drawloom/blob/main/docs/reference/replacing-capabilities.md)
walks through each one, with public examples. Those examples show the shape of a
replacement. They are not production services, and passing a type check alone
does not prove the behaviour.

### Write a plugin

A plugin package brings skills and tools into Drawloom. It starts from an open
format, Agent Plugins 1.0.0: a `plugin.json` manifest, skills in a `skills/`
folder, and MCP servers declared in `mcp.json`. MCP is an open standard for
connecting agents to tools. A plain package needs nothing Drawloom-specific.

Installing, enabling, trusting, signing in and granting tool access are
separate steps. Adding a package does not start its servers or give the agent
anything. A workbench can go further with a trusted backend: code that runs
inside Drawloom and uses its capabilities. Its own interface uses the MCP Apps
standard. Trusting a backend means trusting that code; it is not sandboxed.
Plugins can also add a Settings page for setup. See the
[plugin package guide](https://github.com/mafifi/drawloom/blob/main/docs/reference/plugin-packages.md)
and the [Settings guide](https://github.com/mafifi/drawloom/blob/main/docs/reference/plugin-settings.md).

### Contribute

Start with [CONTRIBUTING.md](https://github.com/mafifi/drawloom/blob/main/CONTRIBUTING.md).
It asks you to agree interface changes before writing code, and to test failure,
cancellation and recovery as well as success. It also asks you to say plainly
what you did and did not test. New dependencies need a licence review.
Everything in this repository is public, so keep private code and data out.

Sign off each commit under the
[Developer Certificate of Origin](https://github.com/mafifi/drawloom/blob/main/DCO)
with `git commit --signoff`. This confirms you have the right to contribute the
work under the Apache 2.0 licence. It does not assign your copyright.

## Go deeper

- [Mac preview release](https://github.com/mafifi/drawloom/releases/tag/v0.0.0-preview.1)
- [Desktop setup guide](https://github.com/mafifi/drawloom/blob/main/apps/desktop/README.md)
- [Notarised release record](https://github.com/mafifi/drawloom/blob/main/knowledge/evidence/adr-0034-notarised-release.md)
- [Foundation API](https://github.com/mafifi/drawloom/blob/main/docs/reference/foundation-api.md)
- [Replace a capability](https://github.com/mafifi/drawloom/blob/main/docs/reference/replacing-capabilities.md)
- [Plugin packages](https://github.com/mafifi/drawloom/blob/main/docs/reference/plugin-packages.md)
- [Contributing](https://github.com/mafifi/drawloom/blob/main/CONTRIBUTING.md)
