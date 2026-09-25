---
step: 5
title: Evidence
question: How we checked it
summary: How we test Drawloom, and what we've proven so far.
draft: false
---

We don't take a design decision's benefits on trust. We test them, and we
publish the results, including what didn't work.

## How we check our work

- **Every change is tested.** Each change to Drawloom runs more than a
  thousand automated tests, plus checks on formatting, types and licences.
- **Every version of a part passes the same tests.** If you replace a part of
  Drawloom with your own, it has to pass the same tests as ours.
- **We test what you install.** We check the packaged app and libraries as you'd
  get them, not just the source code.
- **We break it on purpose.** We force-quit the app and restart its services in
  the middle of work, then check that nothing was lost or done twice.
- **Signed and notarised by Apple.** The Mac app is signed with our Developer ID
  and checked by Apple before release.

## What we've tested so far

- **Recovering from crashes.** Work in progress survives a force-quit and a
  restart. If Drawloom can't tell whether an action finished, it tells you
  rather than guessing.
- **Long-running work.** Workflows pick up where they left off after their
  engine is stopped and restarted.
- **Tool permissions.** Each request to Codex gets its own permissions, and an
  old or replayed request is refused.
- **Knowledge and memory.** Local knowledge search handles 10,000 records, and
  recovers cleanly if it's interrupted.
- **Monitoring.** Tracing adds less than a millisecond to an operation. It
  found the cause of an eight-second delay, which we then fixed.
- **Licences.** Every dependency, and everything inside the Mac app, is checked
  against our licence policy.

Not everything has worked first time. Apple rejected our first release because
of a signing mistake. We caught another problem ourselves: the app couldn't
find Codex when opened from the Dock. We fixed both before publishing
the preview.

## Learn more

- [All our test evidence](https://github.com/mafifi/drawloom/tree/main/knowledge/evidence)
- [The questions we're still working on](/questions/)
