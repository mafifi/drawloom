---
step: 5
title: Evidence
question: How we checked it
summary: How Drawloom checks its work, which checks run on every change, which are manual release steps, and what each check does not prove.
draft: false
---

A decision only counts if someone checks that the work behind it actually
holds up. This step explains how Drawloom checks its work and where the results
are kept. Every result comes with its limits, so you can see what the checks
cover and what they leave out.

## How the checking works

**One set of promises, many implementations.** Each part of Drawloom has a
written interface: what it accepts, what it returns and how it behaves when
something goes wrong. Each interface comes with one shared test suite, and
every implementation of that part must pass the same suite. We call these
*conformance* tests. They check that a replacement keeps the same promises as
the original, even when the code underneath is different. The rule in
[ADR 0004](https://github.com/mafifi/drawloom/blob/main/docs/adr/0004-standardise-capability-contracts.md)
is strict: code that merely compiles against the interface is not called
conforming until the shared suite has run against it. For example, the same
agent suite runs against a simple test agent and against the Codex adapter.
That Codex run uses a simulated connection, not a live model.

**Check the package a user would install.** Tests usually run against the
source code in the repository. But what people install is a built package, and
that can differ. So the automatic checks also pack each package and confirm that
everything it advertises is really inside it. They then install the built
packages into a separate, throwaway folder and run them from there.

**Run the real application, including when it breaks.** Unit tests check small
pieces. We also run whole journeys through the application: sending a request,
restarting the workflow engine partway through, force-quitting the app while
work is pending, then reopening it. The question each time is whether the
person's work survived, and whether anything was done twice.

**Check the licence of everything we ship.** Drawloom must stay free to use and
share. An automatic check reviews the licence of every dependency. A second
check looks at the files that actually end up inside the Mac app, because
packaging can add or remove things. The contributing guide says plainly that
the automatic check cannot see every native component, so people still inspect
the runtime we distribute.

**Sign and notarise the Mac app.** Before a Mac release, the app is signed with
a Developer ID and checked again once it is fully assembled. Apple's notary
service then scans it. Finally, it is installed on a separate clean test Mac.

### What runs automatically, and what is done by hand

On every pull request and every push to `main`, public CI (the automatic checks
that run on GitHub) runs the full repository gate, `check:ci`. That covers
formatting, documentation links, dependency and licence policy, builds, the
packed-package checks, type checking, the test suite and the shared conformance
tests on Node. A separate job starts a real Temporal workflow service and tests
recovery after interruption. Browser tests with synthetic data run as well.
None of this needs private code or credentials.

Building the Mac app, signing it, notarising it and checking it on the clean
Mac are manual release steps. The
[release guide](https://github.com/mafifi/drawloom/blob/main/docs/reference/macos-release.md)
calls signing and notarisation deliberate local release gates, not jobs in
public CI. There is still no macOS CI job, so nothing automatic sees the shipped
app. Tests that use a live model or the operating system's password store are
optional, and they are skipped by default. The records never count a skipped
test as a pass.

## Where the evidence lives

Results are written up as dated records in
[knowledge/evidence](https://github.com/mafifi/drawloom/tree/main/knowledge/evidence).
Each one records the method, the environment, what happened and what was not
tested. When later work changes the picture, the old record stays as it was,
with a note pointing to what replaced it. One example is the
[first release acceptance record](https://github.com/mafifi/drawloom/blob/main/knowledge/evidence/adr-0034-release-acceptance.md),
which stays on file after two later ones. Another is an eight-second delay that
one record accepted as a stopgap and a later record removed. Older records also
mention the Bun runtime, which Drawloom has since replaced with Node. Keeping
them as they were shows how each conclusion was reached.

## Agent integration, tools and plugins

Live runs with Codex showed that Drawloom can keep one tool connection open
while applying a different permission to each request. A delayed request, and a
replayed copy of an old one, were both refused once a newer request had taken
over. Plugins now use the MCP Apps standard, and installation-scoped Settings
passed browser and repository checks.

Limits: the permission binding relies on Codex-specific fields and has to be
retested after upgrades. Crash recovery and exactly-once execution were not
proven. Codex Desktop declined form requests without showing them to the user.
Only a subset of MCP Apps and a bounded part of the Agent Plugins standard were
tested. The Settings checks were not a screen-reader audit.
Records: [0005](https://github.com/mafifi/drawloom/blob/main/knowledge/evidence/adr-0005-tool-exposure.md),
[0007](https://github.com/mafifi/drawloom/blob/main/knowledge/evidence/adr-0007-codex-app-server.md),
[0008](https://github.com/mafifi/drawloom/blob/main/knowledge/evidence/adr-0008-tool-execution.md),
[0013](https://github.com/mafifi/drawloom/blob/main/knowledge/evidence/adr-0013-plugin-host-integration.md),
[0018](https://github.com/mafifi/drawloom/blob/main/knowledge/evidence/adr-0018-plugin-standards.md),
[0029](https://github.com/mafifi/drawloom/blob/main/knowledge/evidence/adr-0029-plugin-settings.md).

## Orchestration

A real local Temporal service was stopped and restarted while a workflow was
waiting for input. The workflow resumed with the same state and no extra work.
Later checks restarted the whole Drawloom host. When an action was cut off
halfway, the result was marked uncertain, and the action was not run a second
time automatically.

Limits: the local server keeps its data in SQLite, and Temporal supports that
for development only, not production hosting. Restarts were tested at chosen
points, not at every moment. Recovery of an in-progress live model session was
not shown.
Records: [0017](https://github.com/mafifi/drawloom/blob/main/knowledge/evidence/adr-0017-orchestration.md),
[0021](https://github.com/mafifi/drawloom/blob/main/knowledge/evidence/adr-0021-local-temporal.md).

## Memory, knowledge and context

Small live experiments with fresh Codex conversations showed observations being
captured, organised and recalled, including evidence that contradicted an
earlier claim. The local knowledge store was tested with 10,000 records. It
also recovered from a deliberate interruption, and the vectors already stored
stayed byte-for-byte unchanged. Four live runs of the complete learning journey
followed.

Limits: in a 24-question comparison, adding semantic search helped with only
one question and gave no clear gain on the others. The maintainer kept hybrid
search and left its wider value for stronger tests later. A 100,000-record run
was stopped early and is not reported as a pass. In the final live run, the
model once wrongly said a tool was unavailable. The records claim no resistance
to prompt injection in general, and the model-backed results cover Apple silicon
and synthetic data only.
Records: [first memory sprint](https://github.com/mafifi/drawloom/blob/main/knowledge/evidence/adr-0022-memory-sprint.md),
[0024](https://github.com/mafifi/drawloom/blob/main/knowledge/evidence/adr-0024-local-knowledge.md),
[0026](https://github.com/mafifi/drawloom/blob/main/knowledge/evidence/adr-0026-gguf.md),
[0027](https://github.com/mafifi/drawloom/blob/main/knowledge/evidence/adr-0027-learning-journey.md).

## Policy, approval and sandbox

An authorisation experiment ran two real policy engines behind one decision
interface, with test cases written to fail first. The project and file work
kept each conversation tied to its own project. Review during that work found
and fixed several defects. In one, disconnecting an account left another
project still connected.

Limits: the authorisation design follows the NIST attribute model and the
AuthZEN information model, but proves neither NIST compliance nor full AuthZEN
conformance. Its example inheritance rules are not core policy. Drawloom relies
on the agent's own sandbox, and the records say that isolating the agent's
built-in tools was not tested.
Records: [0023](https://github.com/mafifi/drawloom/blob/main/knowledge/evidence/adr-0023-authorization.md),
[0020](https://github.com/mafifi/drawloom/blob/main/knowledge/evidence/adr-0020-projects-file-delivery.md).

## Evaluation

Two evaluation libraries passed the same 39 checks. Braintrust used less time and
memory in these small cases. Four live Codex judging cases reached the expected
pass or fail each time.

Limits: some of the judge's explanations were wrong even when its verdict was
right, so this is coarse regression detection, not a proven quality rubric. The
supported implementation was accepted as technical delivery. It does not show
wider judging quality, and a score never grants permission or accepts work.
Records: [comparison](https://github.com/mafifi/drawloom/blob/main/knowledge/evidence/adr-0025-evaluation.md),
[live judging](https://github.com/mafifi/drawloom/blob/main/knowledge/evidence/adr-0025-tools-and-codex-judge.md),
[supported delivery](https://github.com/mafifi/drawloom/blob/main/knowledge/evidence/adr-0025-supported-evaluation.md).

## Observability

The cost of tracing was measured, not assumed. On a very small operation,
local export added about 0.7 ms at the median, roughly 26%. The traces showed
why the list of tools and skills took eight seconds to appear. After the fix,
the first list appeared in about 1.5 ms.

Limits: these are single runs on one Mac, not a latency distribution. Loss of
browser data before it reaches the host was not measured, and neither was
long-running load.
Records: [0019](https://github.com/mafifi/drawloom/blob/main/knowledge/evidence/adr-0019-observability.md),
[discovery fix](https://github.com/mafifi/drawloom/blob/main/knowledge/evidence/discovery-latency-fix.md).

## The Mac release

The signed app passed native recovery tests: normal quit, force-killing the
window and force-killing the background host. Each time, reopening sent no
duplicate request and showed unfinished work as uncertain. These tests used a
scripted agent, not a real Codex model.

Apple rejected the first notarisation. A bundled tool that never runs, esbuild,
still carried its original signature instead of ours, and local verification
had not caught it. The second build
was accepted but then withdrawn: opened from Finder, it could not find Codex.
Earlier tests had all started the app from a terminal, which hid the problem.
The third build was notarised, passed Gatekeeper and installed on the clean
Mac, and the update left the existing app data unchanged.

Limits: the old installation had no conversations to preserve. A first launch
from a real download and a real Codex conversation started from the Dock have
not yet been tried on the clean Mac.
Records: [native acceptance](https://github.com/mafifi/drawloom/blob/main/knowledge/evidence/adr-0034-final-native-acceptance.md),
[notarised release](https://github.com/mafifi/drawloom/blob/main/knowledge/evidence/adr-0034-notarised-release.md).

The working result is described in [Working code](/get-started/), and the
choices these checks support are in [Decisions](/decisions/).

## Go deeper

- [Evidence records](https://github.com/mafifi/drawloom/tree/main/knowledge/evidence)
- [ADR 0004: shared interfaces and conformance tests](https://github.com/mafifi/drawloom/blob/main/docs/adr/0004-standardise-capability-contracts.md)
- [Contributing guide: testing and licence review](https://github.com/mafifi/drawloom/blob/main/CONTRIBUTING.md)
- [Public CI workflow](https://github.com/mafifi/drawloom/blob/main/.github/workflows/ci.yml)
- [Repository scripts, including `check:ci`](https://github.com/mafifi/drawloom/blob/main/package.json)
- [macOS release workflow](https://github.com/mafifi/drawloom/blob/main/docs/reference/macos-release.md)
- [Native recovery runbook](https://github.com/mafifi/drawloom/blob/main/apps/desktop/tests/native-recovery-runbook.md)
