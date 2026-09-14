# Survey and architecture evidence

## Retained publication evidence (tracked)

`surveys/<survey>/` contains the original rendered diagrams, delivery receipts,
automated browser reports and screenshot contact sheets with their PNG files.
These are historical evidence, not disposable build output. The 40 HTML files
were recovered from commit `8c4ec74`; all 159 relocated artifacts are preserved
byte-for-byte from that baseline. They are available in a fresh checkout.

- [Authorization](surveys/authorization-survey/boundary.html)
- [Harness/workbench comparison](../harness-workbench-survey/diagram-evidence.md)
- [Knowledge/memory comparison](../knowledge-memory-survey/verification.md)
- [Evaluation comparison](../evaluation-survey/diagrams.md)

Original absolute paths inside receipts describe the original run, not today's
filesystem. Resolve an artifact by its survey and filename under `surveys/`.
For evaluation, both the former `generated/evaluation-survey/` outputs and the
receipts formerly beside its specs are now together. Other surveys formerly
kept these artifacts alongside their specs. Specs stay in their source survey
directories. Relative screenshot links in contact sheets remain valid because
the HTML and all sidecars moved together. Do not rewrite historical receipts or
regenerate archived HTML: doing so would invalidate existing hash bindings.

## Fresh generated output (ignored)

`generated/<survey>/<timestamp>/` is for new diagram runs. Use:

```sh
node scripts/render-survey-evidence.mjs evaluation-survey promptfoo /Users/afifim/Development/archify/archify/bin/archify.mjs /Users/afifim/Development/promptfoo
```

The command reports the new output directory and retains its delivery receipt.
If performing a separately authorised browser check, point Archify at that new
HTML; its screenshots/contact sheet and JSON receipt belong beside the HTML.
A fresh run is not a replacement for the earlier research evidence. Promotion
to tracked release evidence requires reviewing and preserving the complete run.

`generated/repository-atlas/` is the local reading atlas, rebuilt by
`scripts/repository-atlas.mjs`. All generated paths below this directory are
ignored. This layout deliberately overrides the older generic generated-output
location for architecture evidence only.

## Other JSON is not relocated indiscriminately

Research inventories and editable diagram specs stay with their survey sources.
Evaluation results, evidence chains and model measurements stay under
`knowledge/evidence/`. Packaged fixtures stay with their independently installable
consumer. Build configuration and schemas stay with their owning packages.
Count these categories separately from application code rather than deleting
publication evidence or hiding it through minification.
