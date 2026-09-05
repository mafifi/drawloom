---
title: Why Drawloom?
description: Three attempts to give a doctor more time for medicine, and the lesson I nearly missed.
draft: false
published: '2026-09-05'
media:
  video: episode-steps.mp4
  poster: episode-steps.png
---

My spouse, [Dr Souphi](https://drsouphi.com), is a phenomenal doctor who has
always wanted to run her own clinic. I think she would be the first to admit
that she is at her best as a medical professional, not a salesperson, clinic
manager or financial controller.

But running your own business means doing all of those jobs. Too little of her
time ends up being about what she does best: looking after patients and practising
medicine.

As language models and coding assistants got smarter, I began to think I could
help. For the first time, ideas I had carried around for years felt possible
to build. I could create software to take on the administrative side of her
business and let her focus on the patient and the medicine.

That was the plan. It has taken me three attempts to understand what it needed.

## Summer 2024: a working website, an unfinished idea

My first attempt gave Souphi a functional website and a rudimentary system for
patient management and invoicing. They were separate applications, but they
did useful work.

<figure>
<a href="/drawloom/media/a-place-to-do-the-work/09-legacy-public-reconstruction.png"><img src="/drawloom/media/a-place-to-do-the-work/09-legacy-public-reconstruction.png" width="1892" height="680" loading="lazy" alt="The original homepage: Souphi's portrait behind a large headline, with separate routes to the clinic and academy." style="display:block;width:100%;height:auto" /></a>
<figcaption>The first website's header and hero, reconstructed from the original September 2024 components. Captured now, not an archived screenshot.</figcaption>
</figure>

Marketing was the part I never cracked.

We had photographs from patients who had consented to their use. How could I
turn those into compelling before-and-after images for social media? How could
the software help tell the story of her work?

In 2024, that felt out of reach to me. Looking back through the code, there are
pieces of the marketing system that still call placeholder services. I had
written parts of the shape of a solution without making the whole thing work.

I left her with something good enough to use. It was a long way from the
business support I had imagined.

<figure>
<a href="/drawloom/media/a-place-to-do-the-work/10-legacy-admin-reconstruction.png"><img src="/drawloom/media/a-place-to-do-the-work/10-legacy-admin-reconstruction.png" width="1892" height="800" loading="lazy" alt="The original admin dashboard laid out appointments, inventory, patients, marketing and finances in six cards. All displayed names and figures are demonstration data." style="display:block;width:100%;height:auto" /></a>
<figcaption>The dashboard I aspired to, reconstructed from the original view. Its hardcoded sample figures show the ambition, not the clinic's performance.</figcaption>
</figure>

<figure class="stack">
<svg viewBox="0 0 600 220" role="img" aria-labelledby="stack-one-title stack-one-desc" xmlns="http://www.w3.org/2000/svg" style="display:block;width:100%;max-width:600px;height:auto;margin:auto">
<title id="stack-one-title">First attempt: two separate applications</title>
<desc id="stack-one-desc">The public SvelteKit website ran on Cloudflare Pages. The separate SvelteKit clinic administration app used Firebase services.</desc>
<g fill="none" stroke="#C9C6BE"><rect x="1" y="1" width="280" height="78"/><rect x="319" y="1" width="280" height="78"/><path d="M141 79v50m318-50v50"/><rect x="1" y="130" width="280" height="78"/><rect x="319" y="130" width="280" height="78"/></g>
<g text-anchor="middle" font-family="Arial, sans-serif" fill="#244D40" font-size="27"><text x="141" y="34">Public website</text><text x="459" y="34">Clinic admin</text><text x="141" y="176">Cloudflare Pages</text><text x="459" y="176">Firebase</text></g>
<g text-anchor="middle" font-family="Arial, sans-serif" fill="#535650" font-size="23"><text x="141" y="62">SvelteKit</text><text x="459" y="62">SvelteKit</text></g>
</svg>
<figcaption>Useful first tools: a public presence, patient records and invoicing. Marketing remained unfinished.</figcaption>
</figure>

## Spring 2025: surely the stack was the problem

The models had improved. This time, I was sure I could get it right.

I was half convinced that my first design was holding me back. I had one app
for the public website and another for administration. I wanted to bring the
journey together: from someone discovering Souphi on social media to becoming
a paying patient.

The public site and the new `souphi-admin` remained separate applications.
Sharing a D1 database meant they could work with the same data. That felt like
a way to connect the journey without having to make everything one app.

I was no longer hand-crafting every piece of code with autocomplete helping
along the way. I could describe what I wanted and have the model build whole
components. I started again, with bigger ambitions and much faster progress.

<figure class="stack">
<svg viewBox="0 0 600 220" role="img" aria-labelledby="stack-two-title stack-two-desc" xmlns="http://www.w3.org/2000/svg" style="display:block;width:100%;max-width:600px;height:auto;margin:auto">
<title id="stack-two-title">Second attempt: bring the customer journey together</title>
<desc id="stack-two-desc">The author's account of the second stack: separate public and souphi-admin applications on Cloudflare Pages, using Drizzle and a shared D1 database.</desc>
<g fill="none" stroke="#C9C6BE"><rect x="1" y="1" width="280" height="78"/><rect x="319" y="1" width="280" height="78"/><path d="M141 79v26h318V79M300 105v25"/><rect x="1" y="130" width="598" height="78"/></g>
<g text-anchor="middle" font-family="Arial, sans-serif" fill="#244D40" font-size="27"><text x="141" y="34">Public website</text><text x="459" y="34">souphi-admin</text><text x="300" y="176">Drizzle → shared D1 database</text></g>
<g text-anchor="middle" font-family="Arial, sans-serif" fill="#535650" font-size="23"><text x="141" y="62">Cloudflare Pages</text><text x="459" y="62">Cloudflare Pages</text></g>
</svg>
<figcaption>Separate apps, shared data. I could connect more of the customer journey, but my development process had not caught up.</figcaption>
</figure>

By the start of 2026, I had to admit that I had failed again.

The code had drifted. I was going round in circles, reimplementing features I
thought I had already built. In my judgement, the codebase was no longer worth
rescuing.

It was not just Souphi's software. I had more than a dozen repositories for
various half-finished projects. GitHub's bots seemed to chase me daily about
vulnerable packages and ageing dependencies.

> I had become much faster at generating code. I had not yet found a reliable way to keep it coherent.

## 2026: the codebase finally came together

The third attempt started with a new monorepo: one home for my projects and
their shared code. There was a new stack too, built around Cloudflare Workers
and Convex.

The more important change was how I worked. The coding agents had clear
boundaries and instructions. Design principles
were backed by checks. Tests and review were part of the work, not something
I hoped to come back to later.

<aside class="callout" aria-label="What is a harness?">
<p class="eyebrow">A little terminology</p>
<p>A <em>harness</em> is the system around an agent: its instructions, tools, context and controls. It helps the agent do useful work and check the result.</p>
</aside>

For the first time, I felt I had the codebase under control. I would say I had
finally got that part right.

<figure class="stack">
<svg viewBox="0 0 600 220" role="img" aria-labelledby="stack-three-title stack-three-desc" xmlns="http://www.w3.org/2000/svg" style="display:block;width:100%;max-width:600px;height:auto;margin:auto">
<title id="stack-three-title">Third attempt: shared foundations and enforced rules</title>
<desc id="stack-three-desc">Public and admin applications run on Cloudflare Workers and connect to Convex for backend work and data. A shared monorepo provides common code and automated checks.</desc>
<g fill="none" stroke="#C9C6BE"><rect x="1" y="1" width="598" height="78"/><path d="M300 79v50"/><rect x="1" y="130" width="598" height="78"/></g>
<g text-anchor="middle" font-family="Arial, sans-serif" fill="#244D40" font-size="27"><text x="300" y="34">Public + admin applications</text><text x="300" y="176">Convex · backend + data</text></g>
<text x="300" y="62" text-anchor="middle" font-family="Arial, sans-serif" fill="#535650" font-size="23">Cloudflare Workers</text>
</svg>
<figcaption>Shared code and enforced rules made the work more coherent. For me, the improvement was the stack and the harness around development—not the stack alone.</figcaption>
</figure>

The models now had APIs that made the marketing work feel achievable too.
I could connect writing, images, narration and video generation to real
software, rather than move everything between separate tools by hand.

By autumn, I could claim partial success. But I also had to admit to another
kind of failure.

## A month to automate what I could help create in two hours

I spent a month automating the creation of twenty treatment explainer episodes.
Before that, I had co-created a single episode with Codex in a couple of hours
at most.

<figure>
<a href="/drawloom/media/a-place-to-do-the-work/02-public-episode-opening.png"><img src="/drawloom/media/a-place-to-do-the-work/02-public-episode-opening.png" width="1892" height="800" loading="lazy" alt="The public opening of Treatment Episode 02, with an editorial introduction alongside a patient illustration." /></a>
<figcaption>One of the treatment explainers on Souphi's journal. Behind this public presentation was a much larger production system.</figcaption>
</figure>

To automate the series, I broke production into 23 repeatable steps.

First came research: supporting articles, source quality and clear limits on
what we could say. Then the script and narration, so we could hear the pacing.
Then the scenes: introduce the patient and concern, show an unsuitable treatment,
explain the anatomy, explore a more holistic approach and its limits, and recap.
Finally, assemble the video for review. Publication still needed approval.

Each scene had its own work. Create the image. Bring it to life. Hold it long
enough to make sense. Move to the next scene. Fit it to the narration.

<!-- animation -->

Research and writing needed different tools from images, motion and speech.
The system needed to track dependencies between steps, preserve results and
recover from failures. I built different agent roles, provider connections,
retry handling and a graph of the work.

<figure>
<a href="/drawloom/media/a-place-to-do-the-work/03-programme-raw.png"><img src="/drawloom/media/a-place-to-do-the-work/03-programme-raw.png" width="1892" height="800" loading="lazy" alt="The Treatment Episode production interface, showing eight stage groups and 23 accepted programme milestones." /></a>
<figcaption>The production view: eight stage groups, 23 milestones, and decisions recorded along the way. This already had a user interface and review points; the problem was how much of the creative path I had fixed in advance.</figcaption>
</figure>

<aside class="callout" aria-label="The cost of unattended work">
<p class="eyebrow">Who decides when to spend again?</p>
<p>If a paid video request times out, has it failed—or is the provider still making a video I will be charged for? Is it safe to try again?</p>
<p>How many attempts should an unattended system buy before it stops? What happens if an earlier scene changes after I have paid for the later ones?</p>
</aside>

These were real engineering problems. The automated system needed answers
before I could leave it running. In a workbench, I would still need safe handling
of paid requests, but I could make more of the creative spending decisions myself.

My rough estimate is that the automated approach involved 50,000–100,000 lines
of code. I believe a focused workbench could have needed 10,000 or fewer. That
is my estimate, not a measured comparison with a finished alternative.

I had spent a month making a format repeatable before knowing whether the
audience would respond to it. Changing that format now meant changing the
machinery behind it. The return I needed was a faster way to learn what worked
for Souphi's audience. I had built a faster way to repeat my first answer.

## The light bulb moment

Throughout 2026, I had been using tools that showed me a different approach.

I used Claude Design to help me make much more compelling public websites.
More recently, I turned to Codex Security as I became more concerned about
what increasingly capable models meant for cybersecurity.

<figure>
<a href="/drawloom/media/a-place-to-do-the-work/11-current-public-homepage.png"><img src="/drawloom/media/a-place-to-do-the-work/11-current-public-homepage.png" width="1892" height="800" loading="lazy" alt="The current Dr Souphi homepage: a spacious cream layout with editorial type beside her portrait." style="display:block;width:100%;height:auto" /></a>
<figcaption>Souphi's current website, captured in September 2026. This is the kind of visual work I had been learning to create with better tools.</figcaption>
</figure>

[Claude Design](https://www.anthropic.com/news/claude-design-anthropic-labs)
lets you develop visual work through conversation, comments, direct edits and
controls. [Codex Security](https://openai.com/index/codex-security-now-in-research-preview/)
investigates a codebase, validates possible findings and proposes fixes for
review.

They serve different purposes. What I see in both is a place built around the
work, with an agent helping me do it. I can inspect what is happening and shape
the result. Codex and Claude Code had already taught me the value of that in
development.

Google's [The New SDLC With Vibe Coding](https://www.kaggle.com/whitepaper-the-new-SDLC-with-vibe-coding)
puts a name to the surrounding machinery: the harness. It describes instructions,
tools, execution environments, orchestration, guardrails and ways to observe
the work. The model is only one part of the system.

I was also exploring [Open Design](https://github.com/nexu-io/open-design)
and [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness).
These projects gave me more examples to learn from. But I did not need another
example to see the mistake in my own work.

In development, I had moved beyond expecting a good prompt to produce the
finished result. Yet when I tackled marketing, I went straight back to that
expectation. Write enough specification. Provide enough context. Add agents.
Somehow make the whole thing run.

> I was treating AI like a conventional program: input, process, output. I needed an assistant that could share the work.

But creative work often changes as you do it. You hear a script and realise it
drags. You see a scene and want to take it somewhere else. You publish something
and learn which questions the audience actually cares about.

The work needed a place where those decisions could happen as it took shape.

## A better place to make an episode

Imagine having the sources, script, scenes and narration together. I could ask
the assistant to shorten a section, try another image or compare two versions.
I could see what changed and decide what to keep.

The difference would not just be adding a screen or an approval button. I
already had those. It would be making exploration and revision the normal way
to work, without having to encode every variation in the production process.

Useful parts would still run automatically. Research could be prepared. An
approved scene could be generated. An edit could be assembled. Medical review
would still matter.

The workbench would still need to handle paid requests safely. But the creative
spending decision could stay with me: keep this, try another, or change direction.
I would not have to invent a rule for every choice before making the first video.

I believe it would have taken less effort to build. It could also have reduced
those two hours of work. More importantly, I could have learned from each
episode and changed the next one to suit the audience.

That is the workbench I now wish I had built. It is not an alternative I have
already tested.

## Why Drawloom?

I now believe purpose-built workbenches, powered by agent harnesses, are the
right starting point for complex, creative business work.

Marketing is one example. The same question applies to the other jobs around
Souphi's practice: where would a capable assistant, with the right tools and
controls, give her time back?

We do not need to build every part from scratch.

[Codex App Server](https://developers.openai.com/codex/app-server) exposes Codex
to product clients, including conversation history, approvals and live events.
[Claude Agent SDK](https://code.claude.com/docs/en/agent-sdk/overview) provides
the agent loop, tools and context management behind Claude Code as a programming
library. These are distinct integration offerings, not interchangeable APIs.

They give us something substantial to build on. They do not supply the business
workbench, or decide how its knowledge, tools and controls should fit together.

That is why I am building Drawloom: reusable infrastructure for those
workbenches. The aim is to connect agents to useful knowledge and tools, control
what they can do, and make their work visible and testable. Those parts should
be replaceable without rebuilding the whole product around one provider.

<figure id="drawloom-capabilities">
<svg viewBox="0 0 600 670" role="img" aria-labelledby="drawloom-map-title drawloom-map-desc" xmlns="http://www.w3.org/2000/svg" style="display:block;width:100%;max-width:600px;height:auto;margin:auto">
<title id="drawloom-map-title">Drawloom's intended capabilities</title>
<desc id="drawloom-map-desc">A person works through a purpose-built workbench. Underneath, Drawloom separates eleven capabilities: memory, knowledge, context compilation, model inference, agent execution, orchestration, tools, policy and approval, sandbox, observability and evaluation. Providers are chosen through replaceable implementations. The groups are a reading aid, not separate services or an execution sequence.</desc>
<g fill="none" stroke="#C9C6BE"><rect x="1" y="1" width="598" height="100"/><path d="M300 101v43"/><rect x="1" y="145" width="598" height="395"/><path d="M26 208h548M300 228v285M26 363h548M300 540v43"/><rect x="1" y="584" width="598" height="78"/></g>
<g text-anchor="middle" font-family="Arial, sans-serif" fill="#244D40"><text x="300" y="40" font-size="28">You + your workbench</text><text x="300" y="78" font-size="24">Direct · inspect · revise · approve</text><text x="300" y="187" font-size="28">Drawloom · intended capabilities</text><text x="300" y="632" font-size="26">Replaceable providers + runtimes</text></g>
<g font-family="Arial, sans-serif" fill="#244D40" font-size="22"><text x="28" y="249">PREPARE THE CONTEXT</text><text x="324" y="249">RUN THE WORK</text><text x="28" y="403">ACT WITH LIMITS</text><text x="324" y="403">SEE + ASSESS</text></g>
<g font-family="Arial, sans-serif" fill="#111111" font-size="25"><text x="28" y="284">Memory</text><text x="28" y="316">Knowledge</text><text x="28" y="348">Context compilation</text><text x="324" y="284">Model inference</text><text x="324" y="316">Agent execution</text><text x="324" y="348">Orchestration</text><text x="28" y="441">Tools</text><text x="28" y="473">Policy + approval</text><text x="28" y="505">Sandbox</text><text x="324" y="441">Observability</text><text x="324" y="473">Evaluation</text></g>
</svg>
<figcaption>The intended capability map, not a finished product or a set of separate services. Keep useful context, coordinate work, constrain actions and check what happened.</figcaption>
</figure>

Drawloom is early. The boundaries are taking shape, and the work still needs
to prove itself in real use. I want it to be approachable for a small business,
with useful local or free-tier options wherever possible.

I have no wish to build a fourth elaborate system that misses the point.

The reason for all of this is still the same as it was in 2024: give Souphi
more time to be a doctor.
