# Walk through the Drawloom code

Use this guide to read the repository in a useful order: first understand a
capability, then follow how the application uses it. The maps help you find code;
they are not a completed architecture review.

## Start here

1. Read [Architecture](../../../ARCHITECTURE.md) for the ten capabilities and
   their responsibilities.
2. Open the [ownership map](../evidence/generated/repository-atlas/overview.html).
   Choose a capability to open its detailed map.
3. Use the [reading checklist](../evidence/generated/repository-atlas/index.md)
   to track the files you have inspected. Keep notes in a separate copy because
   regenerating the atlas replaces this checklist.

Generated maps are local files and may be absent in a fresh checkout.
To build them, install Archify separately and run from the repository root,
replacing the example path with your checkout's path:

```sh
node scripts/repository-atlas.mjs /path/to/archify/archify/bin/archify.mjs
```

Archify is a documentation tool, not a product dependency. Its recorded tested
revision is `c1443b31b496eebf4a68bf83151816c955ddb796`. Generated HTML, graph JSON
and the file inventory stay ignored by Git.

## The reading plan

For each capability, read its README, exported interfaces, shared tests,
implementation and application setup in that order. Read the implementation's
tests alongside the code. Shared tests explain the promises that an alternative
implementation must also keep.

Then follow complete user journeys. A dependency diagram cannot show whether
permissions are enforced or what happens when work is interrupted.

| Pass | Read | What to look for |
| --- | --- | --- |
| 1. Understand the design | Architecture, DESIGN.md and the linked ADRs | What does each capability do, and which responsibilities are shared or delegated? The historical ADR 0005 map is not a requirement for eleven packages. |
| 2. Understand the interfaces | Contract packages and their shared tests | What can callers rely on? Can another implementation keep the same promises? |
| 3. Follow a message | Agent, tools, host and context packages | Follow send → agent → tool → result. Check denied access, cancellation and uncertain outcomes too. |
| 4. Load a workbench | Plugin, workbench and desktop packages; desktop host | Follow installation, activation and an MCP App opening. Check project identity and permissions at each step. |
| 5. Follow longer work | Orchestration, evaluation and knowledge | Do evaluation and Nightloom reuse orchestration? What happens after a restart without repeating an edit? |
| 6. Follow the data | History, SQLite providers, asset and file routes | What is stored, what is sent to a provider, and what remains after deletion or stopping collection? |
| 7. Inspect the UI | Desktop Views, ViewModels and shared UI components | Does each screen explain what the user can do? Is application logic kept out of display components? |
| 8. Finish the inventory | Scripts, workflows, publishing, experiments, docs and root configuration | Separate product source from retained research and generated output. Account for assets as well as text files. |
| 9. Challenge the whole journey | The connected paths above | Try offline providers, interruption, late responses and two projects. Does the application preserve the same rules? |

### Review protocol

Work in small sessions: one interface and implementation, or one user journey.
Mark files as **read**, **follow-up** or **not applicable**, with a reason.
Clicking a diagram node does not mean its files have been reviewed.

For a finding, record the file and line, what you observed, why it matters to a
user, the rule it breaks and a test that would demonstrate a fix. Separate bugs
from personal style preferences.

Prioritise permission failures, data loss and repeated actions, then correctness
and recovery, then replaceability and naming. Finish establishing the problem
before refactoring. Agree a repair plan after the reading pass and verify repairs
with focused tests and the repository checks.

Private workbench checks stay in their own repository. They complement public
tests rather than becoming a prerequisite for understanding the core.

### Atlas navigation interaction brief

Overview tiles are ordinary links to family maps. Each map links back to the
ownership map and reading checklist and offers links to the other maps.
Keyboard Enter, touch, opening another tab and browser Back work as navigation;
hover and keyboard focus have a visible outline.

Navigation uses no JavaScript or animation and does not write review state.
Detailed nodes retain Archify's source inspection. Missing generated destinations
fail generation rather than leaving dead navigation links.

The initial build checked all 18 maps using Archify's schema and layout checks.
Its first automated browser attempt was blocked by local-file URL policy.
A later check on **2026-09-14** used a temporary local HTTP preview and verified
tile clicks, Tab/Enter, browser Back and return to the overview. All 374 generated
navigation links resolved. At 390px the toolbar and navigation did not overlap
or overflow horizontally. Four regression tests covered nested SVG groups,
accessible links, detail inspection and missing destinations. These are retained
observations, not a new visual verification from this documentation edit.

## Initial leads, not audit conclusions

The maps show declared package dependencies. Desktop detail maps also show
selected literal imports from source. Neither captures every dynamic connection,
permission check or browser message. Follow the source and tests before drawing
a conclusion.

The desktop host and ViewModel are useful early review targets because they
connect many capabilities. File size alone is not a defect; look for repeated
rules or two components trying to own the same fact.

The UI baseline was commit `8c4ec74`. Cleanup `4b1dc58` removed forty generated
survey HTML pages and reports while retaining their source specifications.
The recorded count then was 148,349 code lines across 1,220 recognised text files.
Those pages were later recovered as publication evidence under
[evidence/surveys](../evidence/README.md), with reports and PNGs. That earlier
count is not the restored repository's current size.

The atlas inventory includes tracked files and nonignored files awaiting commit;
its line totals include comments and blank lines. Keep those measurements
separate from a code-only count. README and Architecture have since received
a plain-language rewrite; inspect remaining status claims against current code.

## Completion criteria

A complete review accounts for every file, identifies each capability's
implementation and tests, and follows critical user journeys through permissions
and recovery. Findings need reproducible evidence and an agreed next step.

Use that review to decide whether the architecture is ready to present publicly.
A clean diagram or passing test suite alone cannot make that decision.
