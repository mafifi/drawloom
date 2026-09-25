---
step: 2
title: Questions
question: What we still need to find out
summary: The questions Drawloom has not yet answered, why each is still open, and what evidence would settle it.
draft: false
---

Every project has an edge where what we know runs out. This page marks where
that edge is for Drawloom today. Each question below is still open in the
repository's own records, and each links to the record that says so. If a later
check answers one, it comes off this list.

## Does it work in real use, not just in tests?

Most of our checks use stand-ins: a scripted agent in place of a real one, or a
machine reached over a remote connection instead of someone sitting at it.
Stand-ins make tests repeatable. They cannot show everything a real person would
run into.

**Do real conversations survive an update?** When we replaced the app on a clean
test Mac, the old installation held no projects or conversations. So we know an
update leaves saved state alone, but not that a real conversation carries across.
An update over an installation with real conversations would answer it
([release record](https://github.com/mafifi/drawloom/blob/main/knowledge/evidence/adr-0034-notarised-release.md)).

**Does the first launch from a normal download go smoothly?** On a clean Mac we
have not yet opened a freshly downloaded copy from the desktop and held a real
Codex conversation in it. Copying the app over a remote connection skips macOS's
first-launch security check, so that path is untested. The same record notes that
Drawloom may not find Codex installed somewhere unusual, such as through a Node
version manager, unless it was started from a terminal
([release record](https://github.com/mafifi/drawloom/blob/main/knowledge/evidence/adr-0034-notarised-release.md)).

**Does recovery after a crash hold with a real agent?** We killed the signed app
mid-task and checked that nothing ran twice and that unfinished work was marked
as uncertain rather than guessed. Those runs used a scripted agent, not a real
Codex session, and the live Codex review lanes were not run
([native acceptance record](https://github.com/mafifi/drawloom/blob/main/knowledge/evidence/adr-0034-final-native-acceptance.md)).

## Safety we have designed but not yet proven

Some protections exist as agreed boundaries and working code, but have only met
test data. We say so plainly, because a setting existing does not prove it is safe.

**Who may see what in a real organisation?** Drawloom has an interface for
deciding whether a person may see a piece of knowledge. It is modelled on a
published US standard for access control (NIST SP 800-162), but we have not
tested it for compliance with that standard or with the AuthZEN specification.
The rules in our tests are examples. A real organisation would supply its own,
and none has yet
([ADR 0023](https://github.com/mafifi/drawloom/blob/main/docs/adr/0023-knowledge-memory-authorization-boundaries.md),
[experiment](https://github.com/mafifi/drawloom/blob/main/knowledge/evidence/adr-0023-authorization.md)).

**What happens to information after access is withdrawn?** Taking access away
stops future reads. It does not erase what was already shown, or copies held in
caches and search indexes. Deletion and cache clean-up still need their own design
([experiment limits](https://github.com/mafifi/drawloom/blob/main/knowledge/evidence/adr-0023-authorization.md#limits-and-decisions-to-bring-back)).

**Can the activity record be trusted to be complete?** Drawloom records what
happened during a task without storing the conversation itself; the technical
term is observability. We measured its cost and showed it helps find problems.
We have not measured what is lost before the record leaves the browser. Nor have
we traced the native app layer, or tested long runs or a full machine restart
([observability record](https://github.com/mafifi/drawloom/blob/main/knowledge/evidence/adr-0019-observability.md#reference-comparison-limits-and-decision)).

## Knowledge and learning

**Does searching by meaning earn its cost?** Drawloom can search by meaning as
well as by matching words. On 10,000 records, it found one fact that word search
missed, but gave no clear improvement across the other meaning-based questions.
A 100,000-record run was stopped for review rather than passed. We kept the
feature and said stronger workloads must decide whether it earns its place
([ADR 0024](https://github.com/mafifi/drawloom/blob/main/docs/adr/0024-local-knowledge-memory-and-retrieval.md),
[evidence](https://github.com/mafifi/drawloom/blob/main/knowledge/evidence/adr-0024-local-knowledge.md#paired-live-answer-evaluation)).

**Can it tell related material from enough material?** Search filters out
unrelated records. It does not yet notice when records are related but
incomplete, and how precise search stays at larger scale is unmeasured
([audit](https://github.com/mafifi/drawloom/blob/main/docs/plans/pre-publication-audit.md#limits-the-delivery-states-rather-than-hides)).

**Is an AI judge worth what it costs?** Drawloom can ask a model to score a
result. In a supported test it told a faithful passage from a contradictory one.
Two tiny passages still used around 19,000 to 23,000 input tokens each. Whether
the judge's scores are reliable in general, and whether they are useful in
practice, remains open
([ADR 0025](https://github.com/mafifi/drawloom/blob/main/docs/adr/0025-evaluation-boundaries-and-comparative-proof.md),
[evidence](https://github.com/mafifi/drawloom/blob/main/knowledge/evidence/adr-0025-supported-evaluation.md#supported-live-native-judging)).

## Platforms and providers

**Will it work with agents other than Codex?** The shared agent interface was
designed so that providers can be swapped, but Codex is the only supported
integration. Features specific to Codex stay outside the shared interface until
a second provider shows what should be common. A second real integration, passing
the same tests, would answer this
([ADR 0007](https://github.com/mafifi/drawloom/blob/main/docs/adr/0007-provider-neutral-agent-execution.md),
[README](https://github.com/mafifi/drawloom/blob/main/README.md)).

**Will it run beyond Apple silicon Macs?** The preview needs an Apple silicon
Mac, and our release evidence comes from that hardware. The local AI model
features were accepted only on Apple silicon. Other operating systems and
architectures are untested
([native acceptance record](https://github.com/mafifi/drawloom/blob/main/knowledge/evidence/adr-0034-final-native-acceptance.md#explicit-remaining-limits)).

**Would we notice a broken release before you did?** Every automated check runs
on Linux. Building, signing and verifying the Mac app is a manual step, so no
automated job would catch a broken app bundle. A Mac job in our automated checks
would close this gap
([audit, F9](https://github.com/mafifi/drawloom/blob/main/docs/plans/pre-publication-audit.md#f9--no-macos-runner-so-nothing-in-ci-sees-the-shipped-artifact-medium-open)).

## Ask a new question

If you can see a gap we have missed, or have evidence that answers one of these,
please [open an issue on GitHub](https://github.com/mafifi/drawloom/issues).
Good questions shape what we look into next, which is the subject of
[Investigations](/research/).

## Go deeper

- [Notarised release record](https://github.com/mafifi/drawloom/blob/main/knowledge/evidence/adr-0034-notarised-release.md)
- [Final native acceptance record](https://github.com/mafifi/drawloom/blob/main/knowledge/evidence/adr-0034-final-native-acceptance.md)
- [Pre-publication architecture audit](https://github.com/mafifi/drawloom/blob/main/docs/plans/pre-publication-audit.md)
- [Local knowledge evidence](https://github.com/mafifi/drawloom/blob/main/knowledge/evidence/adr-0024-local-knowledge.md)
- [All evidence records](https://github.com/mafifi/drawloom/tree/main/knowledge/evidence)
- [Architecture decision records](https://github.com/mafifi/drawloom/tree/main/docs/adr)
