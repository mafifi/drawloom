---
title: Work that survives
description: When the app dies mid-task, you decide what happens next.
draft: true
---

In [Why Drawloom?](/articles/a-place-to-do-the-work/) I asked a question I
couldn't answer at the time. If a paid video request times out, has it failed?
Or is the provider still making a video I'll be charged for?

That question stayed with me. This essay is about how Drawloom answers it.

Some AI work is over in seconds. Some takes much longer. Producing an episode
means rendering scenes, waiting for my review and assembling a draft. Nightloom,
Drawloom's background helper for knowledge, works through what my conversations
have taught the agent and turns it into learnings.

Work like that has to survive real life. Apps crash. Computers restart. People
quit and come back later.

## I'd already built this once

For the treatment episodes, I built my own machinery to keep 23 steps on track.
It tracked which steps depended on which, kept every result and retried when
something failed.

And yes, of course my retry code let me down.

It was a lot of code to get right. Recovering from failure is one of the
hardest parts of any system, and I was writing it alongside everything else.

Keeping long work alive through failure is a well-known problem. Whole teams
have spent years solving it. The software that does the job is called a
workflow engine, and [Temporal](https://temporal.io) is one of the best
established.

## Reuse before you build

One of Drawloom's principles is reuse. If an existing library meets the need,
we use it. If it doesn't, we learn from proven work before building our own.

So we didn't write a workflow engine. Drawloom runs a local Temporal service on
your Mac, beside the app. Temporal records each step of a task as it happens. If
the app stops, the work is still there when it starts again.

Plugin authors never have to learn Temporal. They write ordinary TypeScript: do
these three things at once, wait for a person, then carry on. The engine sits
behind Drawloom's own interface, so it can be replaced later.

When you quit Drawloom, it stops starting new steps and shuts down cleanly. When
you reopen it, your saved work comes back. Moving between screens doesn't cancel
anything. Cancelling is something you choose to do.

Steps that already finished aren't run again. Their results are kept and reused.

## The hard part is the step in the middle

Recovery is easy for work that finished, and for work that never started. The
hard case is the step that was running when everything stopped.

Imagine the app is asking a video service for a scene when it's killed. The
request may never have arrived. It may be rendering now. It may have finished,
with the bill already on its way. From inside the app, those cases look the
same.

A simple system tries again. That feels helpful. But if the first request went
through, you've just paid twice.

Drawloom doesn't guess. Before it starts a step, it writes down what it's about
to do. When the step finishes, it writes down the result before moving on. After
a crash, those notes show how far each step got.

If a step started but never recorded a result, Drawloom doesn't run it again on
its own. A step can offer a way to find out what really happened, for example by
asking the provider. If there's no way to tell, the step is marked uncertain.

## It tells you, and you decide

This is the part I care about most.

If Drawloom is killed while a tool is running, and you open it again, it doesn't
send the request a second time. The unfinished step stays in the conversation,
marked as uncertain. The approval that was waiting has gone, because it no
longer applies.

That can feel less magical than a system that quietly picks up where it left
off. I think it's far more useful. You can check the provider, look at what
arrived and decide whether another attempt is worth paying for.

The same rules run through everything. Each step gets one attempt unless its
author allows more, and even then only a set number. A refusal is never a
reason to try again. Neither is uncertainty. Starting a workflow never gives the
agent permission to do more than you've allowed.

Nightloom follows the same rules. If it was part-way through a review when the
app closed, it checks on that same review when it reopens. It doesn't send the
work off again, and reopening doesn't give it a fresh budget to spend.

Cancelling is a request too. Drawloom asks the work to stop and keeps whatever
already finished. It doesn't pretend it can undo what a provider has already
done.

## Who decides when to spend again?

Back to that question from the first essay. How many attempts should an
unattended system pay for? Is it safe to try again?

Drawloom's answer is simple. It never pays for the same action twice on its own.
When it can't tell whether something finished, it tells you, and you decide.

Has it saved me money? Yes and no. It has stopped the silly spending. But getting
the retry policy right is still a real pain.

Add reviewers to a chain of steps and a new question appears. When do you stop
reviewing again and again? That gets harder when the model gives a different
answer each time.

I think that's what makes long-running AI work trustworthy. Everything fails
sometimes. What matters is how the work recovers. It should keep what's done,
say what it doesn't know and leave anything that costs money in your hands.

That's the kind of assistant I want working beside Souphi. It can carry on while
we're away, and it never spends our money on a guess.

Drawloom is free and open source.
[Try the preview for Mac](https://github.com/mafifi/drawloom/releases/tag/v0.0.0-preview.1),
or [read the decisions behind it](/decisions/).
