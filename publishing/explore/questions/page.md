---
step: 2
title: Questions
question: What we still need to find out
summary: The questions we're still working on, and how you can help answer them.
draft: false
---

Drawloom is early. These are the big questions we're still working on.

## Will it work with other AI agents?

Drawloom works with Codex today. It's designed so other agents can plug in the
same way, and we want to prove that by adding a second one.

## Will it run on other computers?

The preview runs on Macs with Apple silicon. We haven't tested Windows, Linux or
Intel Macs yet.

## Can it follow your organisation's rules about who sees what?

Drawloom checks who is allowed to see each piece of stored knowledge, and your
organisation sets the rules. We designed this using a published standard from
NIST, but so far we've only tried it with example rules. We'd like to try it
with a real organisation.

## Does searching by meaning pay off?

Drawloom can search your knowledge by meaning as well as by keywords. In our
first test of 24 questions, searching by meaning found one answer that keywords
missed. We need bigger, real-world tests to know whether it's worth it.

## Can an AI reliably check an AI's work?

Drawloom can ask a model to score a result. In our tests it gave the right
verdicts, but sometimes for the wrong reasons, and it used a lot of tokens to do
it. We don't yet know how far to trust it.

## How do we catch problems before you do?

Every change to Drawloom is tested automatically. Building and checking the Mac
app is still done by hand before each release, and we'd like to automate that
too.

## Have a question?

If you have a question we haven't thought of, or an answer to one of these,
please [open an issue on GitHub](https://github.com/mafifi/drawloom/issues).

## Learn more

- [How we check our work](/evidence/)
- [Open issues on GitHub](https://github.com/mafifi/drawloom/issues)
