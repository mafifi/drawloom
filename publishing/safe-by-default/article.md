---
title: Safe by default
description: Nothing happens without your say.
draft: false
published: '2026-09-25'
---

Souphi's clinic runs on sensitive information. Patient records. Invoices. Photos
from patients who agreed to share them.

If an AI agent is going to help run that practice, it will touch all of it. It
might read a record, draft a message or change a file. That's the help I want.
It's also what worries me.

I wanted Drawloom to be something I'd trust around her patients. So safety
became the first of Drawloom's principles. Everything else comes after it.

The idea is simple. Nothing happens without your say.

I learned why the hard way. I can't share the details, but an agent once
connected to a live production system instead of the development one it was
meant to use. It broke things.

## Installing a plugin gives it nothing

Plugins are how a workbench grows. One might add a video editor. Another might
connect to a booking system.

Installing software is often the moment you hand it power. In
Drawloom, installing a plugin gives it nothing. A new plugin starts switched
off.

After that, each step is its own choice. You install the plugin. You turn it on.
You decide whether to trust the program behind it. You sign in to any service it
needs. And you decide which of its tools the agent may use.

Signing in doesn't give it permission either. Neither does saving its settings.
A plugin's description of itself never grants anything. The only permission a
plugin has is the permission you gave it.

## The agent asks before it acts

When the agent wants to do something that changes your work, it stops and asks
first.

You see what it wants to do, and with what. It might be editing a file or
running a tool with particular details. You say yes or no. Your yes covers that
one action, exactly as you saw it. The agent can't swap in something different
afterwards.

Drawloom doesn't invent its own way of asking. It uses the approval controls you
already know from Codex. There's no second set to learn just for Drawloom.

You can also choose how much to hand over, one conversation at a time. "Ask me"
means you approve each action yourself. "Approve for me" hands the decision to
Codex's own automatic reviewer, which weighs each action within the limits
you've set.

Only tools that simply read are allowed through without review. Anything that
changes something, or that we can't classify, goes to review.

And if the review can't happen, the action doesn't happen either. If the
approval controls aren't available, Drawloom reports it and stops.

## Three separate jobs

It helped me to split safety into three questions.

First, the agent asks for a tool. That's a request. Nothing more.

Second, Drawloom decides whether that tool may be used. It checks the permission
you granted, every time, just before the tool runs. If you've taken that
permission back, the tool doesn't run.

Third, something has to limit what the work can reach on your machine. That's
the sandbox: the walls around where the agent can work and what it can touch.
For that, Drawloom relies on the agent's own environment. Codex already has
one, and Drawloom keeps its settings as you set them.

Keeping these jobs apart matters. Each one protects you on its own. A yes from
the reviewer doesn't replace the permission you granted. A permission doesn't
remove the sandbox walls. If one part fails, the others still stand.

## Watching without listening

When something goes wrong, you need to see what happened. Which tool ran? What
was refused? How long did we wait for a person to approve?

Drawloom records that kind of activity using OpenTelemetry, an open standard for
monitoring software. It keeps a record of what happened and how long it took.

It never records what you said. Your prompts, your documents, your media and the
details you give a tool stay out. So do passwords and keys. Your conversations
remain yours.

Sending that monitoring anywhere is your choice. By default, nothing leaves.

## Your organisation's rules

A clinic of one has simple rules. A larger business has many. Who may read the
finance notes? Can a contractor see the client files? May this document go to
an outside AI model at all?

I didn't want to write those rules for anyone. Every organisation has its own,
and they know them better than I do.

So we split the job in two. Your organisation decides the rules. Drawloom
enforces them.

For the design, we turned to people who have thought about this for years. The
US National Institute of Standards and Technology, NIST, publishes a model for
deciding access from facts about the request. Who is asking? What do they want
to do? What are they asking about, and in what circumstances? It's called
attribute-based access control, set out in NIST SP 800-162. Drawloom's access
boundary was designed using NIST's model.

The question itself has a standard shape too. A group called OpenID published
AuthZEN, a common way for an app to ask "is this allowed?" and get a clear
answer. Drawloom asks its questions in that shape. That means a business can
bring its own policy engine to answer them.

The agent can't talk its way in. It can't hand Drawloom a note saying it's
allowed, or label itself with a higher clearance. The facts come from trusted
sources your organisation controls.

And missing information never quietly becomes permission. If Drawloom can't
tell who is asking, or the rules can't be checked, the answer is no.

Being allowed to read something on your own computer doesn't mean it may be
sent to an AI model either. That's a separate question, with its own answer.

On your own Mac, all of this stays simple. You're the owner, and there's
nothing to set up. A business can bring its own identity, rules and policy
engine through the same door.

In the end, it comes down to trust. An agent is only useful if you let it work.
You can only let it work if you know where the limits are, and who sets them.
In Drawloom, that's you.

That's what lets me picture an agent working beside Souphi. It can help with
the running of the clinic, and her patients' information stays in careful
hands.

For a business, the promise is the same at a bigger scale. Bring your own rules.
Drawloom will keep them.

Drawloom is free and open source.
[Try the preview for Mac](https://github.com/mafifi/drawloom/releases/tag/v0.0.0-preview.1),
or [read the decisions behind it](/decisions/).
