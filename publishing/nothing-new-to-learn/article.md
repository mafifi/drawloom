---
title: Nothing new to learn
description: Familiar screens that show only what helps.
draft: true
---

Most people who open Drawloom will already have used an AI assistant. Many
will have worked with Codex or Claude for months. They know how a conversation
looks, where to type and how to stop the agent. They know what it means when
the agent asks before it acts.

That knowledge is worth a lot. I didn't want Drawloom to throw it away.

So familiarity is one of our principles. Drawloom should be easy to find your
way around, and feel familiar to anyone who uses other AI tools. It should work
with the tools people already have and keep the controls they already trust.

Every time a new tool surprises you, it takes a little of your attention. Spend
enough of it and people stop using the tool. A familiar tool gets out of the
way, so you can think about your work.

<!-- ASK: Was there a moment with another tool that made this principle matter to you? -->

## The agent's own approval

Approval is the clearest example. Before an agent changes something, you often
want to see what it plans to do and say yes or no.

We could have built our own reviewer for that. Early on, we talked about
previews for every change and a separate step to prepare each edit before
applying it.

Instead, Drawloom uses the review Codex already has. Choose **Ask me** when you
want to decide yourself. Choose **Approve for me** when you're happy for
Codex's own reviewer to decide within what you've allowed. Each conversation
keeps its own choice.

Two reviewers would mean two sets of rules and two places to look. One reviewer
means the controls behave the way people already expect.

We gave nothing up in safety. Any Drawloom tool that can change something goes
through review. Only tools marked as read-only skip it. And approving an action
never gives the agent more than Drawloom's own permissions allow.

## One set of parts for every screen

Familiar also means consistent. A menu should open and close the same way on
every screen. So should a dialog, a search box and a sidebar. The same keys
should work wherever you are.

That's hard to get right by hand. We'd adopted shared components, yet our
screens kept drifting. The sidebar and the message box came out slightly
different each time, and the same layout fixes kept coming back.

<!-- ASK: Which drift annoyed you most before you fixed it? -->

So every screen in Drawloom is now built from one shared set of parts. They
come from shadcn-svelte, an open-source collection of components. Underneath,
Bits UI gives them the right behaviour for keyboards and screen readers. For
conversation pieces, such as messages and tool results, we use open-source
collections built on the same parts.

An automated check holds us to that choice. If a change builds its own
button or menu, the check names the shared part to use instead.

Small details follow the same thinking. When you send a message, only the Send
button shows that it's busy. Buttons that simply aren't available stay quiet.

## Start from screens people know

We never design a screen from a blank page. We start from a real app that does
something similar well.

That might be a screen from Mobbin, a library of real app screenshots. It might
be one of my own screenshots, or a Drawloom screen we've already approved. We
borrow its layout, grouping and spacing, and keep Drawloom's own colours.

Then we ask three questions about every view.

What am I telling the user? What am I letting them do? What can wait until they
ask?

Take the Plugins screen. It tells you what each plugin offers and whether it's
ready to use. It lets you find, connect and set one up. Its tools, permissions
and diagnostics wait until you ask for them.

The conversation works the same way. You see what was said and what is
happening. You can write, attach, send, stop and look closer. The detail of
each tool the agent used is there when you want it.

Behind the questions is one rule. Everything on screen should help you
understand your work, make a decision or take an action. Having the data is no
reason to show it.

That's harder than it sounds. AI agents produce a lot of detail, and it's
tempting to put all of it on screen. Most of it can wait.

## Words people use

We take the same care with words. Everyday screens carry no engineering jargon.

When you look through your notes for an idea, Drawloom calls it "Search by meaning".
The technical term would be "embedding inference". If a folder has gone
missing, Drawloom says "This folder is unavailable". It never says "Directory
binding validation failed".

Labels use plain nouns and clear verbs: Plugins, Search knowledge, Restore
conversation, Connect. They say what will happen next.

Technical detail still has a home. It appears when you're setting something up,
deciding whether to trust something or fixing a problem.

Some things are never hidden to make a screen look simpler. Before you download
a model, you see its size and licence. You see when something is about to leave
your computer. You see when an action can't be undone.

## Familiar is what gets used

For a business, this matters more than it first appears. A tool that feels
familiar needs no training course. People open it and start working. The tool
they already understand is the one they'll actually use.

For a developer building their own workbench, the same shared parts are there
to build with. Your screens can feel familiar from the first day, without
rebuilding menus, dialogs and conversation views yourself.

<!-- ASK: How do you hope Souphi will feel the first time she opens a workbench built this way? -->

Good design is mostly about what you leave out. Show what
helps. Keep the rest close by, ready when someone asks.

Drawloom is free and open source.
[Try the preview for Mac](https://github.com/mafifi/drawloom/releases/tag/v0.0.0-preview.1),
or [see the principles behind it](/principles/).
