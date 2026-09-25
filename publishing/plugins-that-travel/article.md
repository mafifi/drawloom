---
title: Plugins that travel
description: Build it once, take it anywhere.
draft: true
---

A workbench is only as useful as what it can do. Drawloom gets most of that from
plugins.

A plugin is a package you add to Drawloom. It brings skills, which are written
instructions that teach the agent how to approach a job. It brings tools, which
the agent can use to get the job done. Some plugins also bring a screen of their
own.

For Souphi's treatment episodes, I have plugins for editorial work, media,
narration, brand and video. Each does one job well. The treatment workbench brings them
together.

The question I had to answer was simple. What shape should a plugin take?

## The first version spoke only Drawloom

My first answer was a Drawloom answer. A plugin was code that plugged into
Drawloom's own startup, with Drawloom's own building blocks.

It worked. But it meant every plugin needed Drawloom-specific parts, even the
simple ones. A plugin that only offered a few skills and tools still had to be
written for Drawloom and nothing else.

That bothered me. A narration plugin is useful wherever you work with an agent.
Why should it only work in one app?

<!-- ASK: Was there a moment when this first design started to feel wrong? For example, wanting to use one of your plugins outside Drawloom. -->

It also cut against something I care about. If you build a plugin for your own
business, you should own it. It shouldn't be tied to whichever app you happened
to build it for.

## Three open standards instead of one new format

So we stopped inventing and looked at what already existed. Three open standards
fitted together.

The first is the [Agent Plugins](https://agent-plugins.org/specification)
format. It describes how a plugin package is laid out. There's a short file at
the top that names the plugin. Skills go in their own folder. Another file lists
the tools the plugin connects to.

The second is the [Model Context Protocol](https://modelcontextprotocol.io/),
usually called MCP. It's the common way for an agent to connect to tools. A
plugin's tools run as small MCP servers, and Drawloom talks to them the standard
way.

The third is [MCP Apps](https://modelcontextprotocol.io/extensions/apps/overview).
It lets a tool bring its own screen, such as an editor or a preview, shown safely
inside the app.

Drawloom reads plugins in that standard format. A plugin with skills and tools
needs no Drawloom files at all, and no Drawloom code.

That's what lets a plugin travel. The format is designed so that any AI tool
that reads it can load the same package. Build your narration plugin once, and
it isn't locked into Drawloom.

We moved my own plugins across. Editorial, media, narration, brand and video are
all standard packages now. Then we removed the old Drawloom-only route
altogether, rather than keep two ways of doing the same thing.

## A little extra for richer workbenches

Some workbenches need more than skills and tools. The treatment workbench needs
to know which project it's working in. It needs to call tools through Drawloom's
own permission checks. It needs to run long tasks that survive a restart.

For that, Drawloom offers a small set of extensions. They live in their own
clearly named corner of the plugin, so the standard parts stay standard. Other
tools can ignore the extras and still load everything else.

The main extension is a trusted backend. It's a piece of code that runs inside
Drawloom and can use Drawloom's capabilities, such as the project context, tools
and long-running tasks. If something it needs is missing, only the extra
features switch off. The plugin's standard skills and tools keep working.

The screens stay on MCP Apps. We didn't invent a new way for a plugin's screen
to talk to Drawloom. The treatment workbench's editor is an ordinary MCP App.

The second extension is a Settings page for each plugin. A plugin might need you
to download a local model, choose an account or save your preferences. Its page
sits in Drawloom's Settings, beside everything else.

That page works before you've started a conversation, and before any model is
ready. It can tell you what's missing and help you fix it. Saving a preference
changes your preferences, and nothing more. It never gives the plugin
permission to do something new.

## Adding a plugin stays safe

Letting plugins in is a trust question. A plugin can run programs on your
computer, so you should decide exactly how far to trust each one.

In Drawloom, those decisions are separate steps.

First, you install the plugin. Drawloom reads its files and checks them. It
starts nothing, runs none of its code and loads none of its instructions into
the agent.

Next, you enable it. Only then does Drawloom start the plugin's tools, after a
restart.

If the plugin has a trusted backend, trusting it is a separate choice. Drawloom
never trusts a backend by default.

Then there's permission to use each tool. Enabling a plugin doesn't hand the
agent its tools. Every tool still needs your grant, and the agent's actions
still go through the same review as everything else.

Installing never grants permission. Neither does enabling, trusting or signing
in. Each step does one thing, and you can see which ones you've taken.

The same care runs through the details. Two plugins can offer tools with the
same name, and Drawloom keeps them apart. Sign-in details go in your Mac's own
secure store. Being installed doesn't put a skill in front of the agent. You
choose the skills you want.

The video plugin shows why this matters. Making a video costs money. Its plugin
asks you to confirm the exact request before it spends anything, using a
standard way for a tool to ask you a question. Nothing the agent says can give
that confirmation for you.

## What this means for you

If you're building a workbench, you can start with the standard format and stop
there. A plugin with skills and tools needs nothing more. When your workbench
needs Drawloom's capabilities, the extras are there, and they're small.

If you're running a business, the plugins you build are yours. They follow open
standards, so they aren't tied to Drawloom. If something better comes along,
your work goes with you.

And adding a plugin never quietly gives it more power than you chose. You decide
what it can do, one step at a time.

<!-- ASK: Is there a plugin you'd love to see someone build for Drawloom, or one you already use in another AI tool? -->

Drawloom is free and open source.
[Try the preview for Mac](https://github.com/mafifi/drawloom/releases/tag/v0.0.0-preview.1),
or [read the decisions behind it](/decisions/).
