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

In 2024, that felt out of reach to me. Looking back at that code now, I can
still see marketing features connected to placeholder services. I had outlined
a solution without making the whole thing work.

I left her with something good enough to use. It was a long way from the
business support I had imagined.

<figure>
<a href="/drawloom/media/a-place-to-do-the-work/10-legacy-admin-reconstruction.png"><img src="/drawloom/media/a-place-to-do-the-work/10-legacy-admin-reconstruction.png" width="1892" height="800" loading="lazy" alt="The original admin dashboard laid out appointments, inventory, patients, marketing and finances in six cards. All displayed names and figures are demonstration data." style="display:block;width:100%;height:auto" /></a>
<figcaption>The dashboard I aspired to, reconstructed from the original view. Its hardcoded sample figures show the ambition, not the clinic's performance.</figcaption>
</figure>

<figure class="architecture-figure" id="stack-2024">
<p class="diagram-kicker">2024 · Separate foundations</p>
<a href="/drawloom/artwork/why-drawloom/stack-2024.svg" aria-label="Enlarge the 2024 architecture diagram"><img src="/drawloom/artwork/why-drawloom/stack-2024.svg" width="1440" height="784" loading="lazy" alt="Public SvelteKit website deployed on Cloudflare Pages; a separate SvelteKit administration app uses Firebase." /></a>
<figcaption>A public presence, patient records and invoicing. Marketing remained unfinished. <a href="/drawloom/artwork/why-drawloom/stack-2024.svg">Enlarge diagram ↗</a></figcaption>
</figure>

## Spring 2025: surely the stack was the problem

The models had improved. This time, I was sure I could get it right.

I was half convinced that my first design was holding me back. I had one app
for the public website and another for administration. I wanted to bring the
journey together: from someone discovering Souphi on social media to becoming
a paying patient.

I built a new admin application, `souphi-admin`. It and the public site
remained separate applications.
Sharing a D1 database meant they could work with the same data. That felt like
a way to connect the journey without having to make everything one app.

I was no longer hand-crafting every piece of code with autocomplete helping
along the way. I could describe what I wanted and have the model build whole
components. I started again, with bigger ambitions and much faster progress.

<figure class="architecture-figure" id="stack-2025">
<p class="diagram-kicker">2025 · A shared data layer</p>
<a href="/drawloom/artwork/why-drawloom/stack-2025.svg" aria-label="Enlarge the 2025 architecture diagram"><img src="/drawloom/artwork/why-drawloom/stack-2025.svg" width="1480" height="944" loading="lazy" alt="Separate public and souphi-admin applications on Cloudflare Pages both use Drizzle to access the same D1 database." /></a>
<figcaption>Separate applications could work with the same data. My development process still needed to catch up. <a href="/drawloom/artwork/why-drawloom/stack-2025.svg">Enlarge diagram ↗</a></figcaption>
</figure>

## Early 2026: faster code was not enough

By the start of 2026, I had to admit that I had failed again.

The code had drifted. I was going round in circles, reimplementing features I
thought I had already built. In my judgement, the codebase was no longer worth
rescuing.

It was not just Souphi's software. I had more than a dozen repositories for
various half-finished projects. GitHub's bots seemed to chase me daily about
vulnerable packages and ageing dependencies.

> I had become much faster at generating code. I had not yet found a reliable way to keep it coherent.

The third attempt started with a new monorepo: one home for my projects and
their shared code. There was a new stack too, built around Cloudflare Workers
and Convex.

The more important change was how I worked. The coding agents had clear
boundaries and instructions. Automated checks enforced the design principles.
Tests and review were part of the work, not something I hoped to come back to.

<aside class="callout" aria-label="What is a harness?">
<p class="eyebrow">A little terminology</p>
<p>A <em>harness</em> is the system around an agent: its instructions, tools, context and controls. It helps the agent do useful work and check the result.</p>
</aside>

For the first time, I felt I had the codebase under control. I would say I had
finally got that part right.

<figure class="architecture-figure" id="stack-2026">
<p class="diagram-kicker">2026 · Shared code, enforced rules</p>
<a href="/drawloom/artwork/why-drawloom/stack-2026.svg" aria-label="Enlarge the 2026 architecture diagram"><img src="/drawloom/artwork/why-drawloom/stack-2026.svg" width="1480" height="944" loading="lazy" alt="Public and administration applications on Cloudflare Workers use Convex for backend and data." /></a>
<figcaption>One monorepo and automated checks supported the work. The improvement was the stack and the harness around development—not the stack alone. <a href="/drawloom/artwork/why-drawloom/stack-2026.svg">Enlarge diagram ↗</a></figcaption>
</figure>

The models now had APIs that made the marketing work feel achievable too.
I could connect writing, images, narration and video generation to real
software, rather than move everything between separate tools by hand.

By September 2026, I could claim partial success. The codebase was in better
shape. But my approach to marketing had exposed a different problem.

## A month to automate what I could help create in two hours

First, I co-created a treatment explainer episode with Codex. It took a couple
of hours at most.

Then I spent a month building a system to automate the creation of twenty
episodes.

<figure>
<a href="/drawloom/media/a-place-to-do-the-work/02-public-episode-opening.png"><img src="/drawloom/media/a-place-to-do-the-work/02-public-episode-opening.png" width="1892" height="800" loading="lazy" alt="The public opening of Treatment Episode 02, with an editorial introduction alongside a patient illustration." /></a>
<figcaption>One of the treatment explainers on Souphi's journal. Behind this public presentation was a much larger production system.</figcaption>
</figure>

To make the series repeatable, I broke production into 23 steps.

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

The two hours went into making an episode. The month went into building a
production system. I had made a format repeatable before knowing whether the
audience would respond to it.

Changing that format now meant changing the machinery behind it. The return
I needed was a faster way to learn what worked
for Souphi's audience. I had built a faster way to repeat my first answer.

## The light bulb moment

Alongside that work, I had been using tools that showed me a different approach.

I used Claude Design to help me make much more compelling public websites.
More recently, I turned to Codex Security as I became more concerned about
what increasingly capable models meant for cybersecurity.

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
They reinforced a lesson I had already learned in development and failed to
apply to marketing.

In development, I had moved beyond expecting a good prompt to produce the
finished result. Yet when I tackled marketing, I went straight back to that
expectation. Write enough specification. Provide enough context. Add agents.
Somehow make the whole thing run.

> I was treating AI like a conventional program: input, process, output. I needed an assistant that could share the work.

But creative work often changes as you do it. You hear a script and realise it
drags. You see a scene and want to take it somewhere else. You publish something
and learn which questions the audience actually cares about.

The work needed a place where those decisions could happen as it took shape.

That is what I mean by a **workbench**: a place to keep the developing work,
inspect it and direct the next change. Its **harness** gives the agent the
instructions, context, tools and controls to help.

<figure>
<a href="/drawloom/media/a-place-to-do-the-work/12-operator-annual-plan.jpg"><img src="/drawloom/media/a-place-to-do-the-work/12-operator-annual-plan.jpg" width="1229" height="768" loading="lazy" alt="The Laifu and Nini Operator workbench shows an accepted annual plan, story cards with separate script, image and narration stages, and the Codex conversation below." /></a>
<figcaption>My story-production workbench in a local staging build: the plan, individual stories and conversation share one working surface. This is not a finished Drawloom product or a tested replacement for the treatment-video system.</figcaption>
</figure>

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

I could decide whether another attempt was worth paying for. The system would
still need to avoid duplicate charges and respect limits; it would not need
to make every creative spending decision on my behalf.

I believe it would have taken less effort to build. It could also have reduced
those two hours of work. More importantly, I could have learned from each
episode and changed the next one to suit the audience.

That is the workbench I now wish I had built. It is not an alternative I have
already tested.

<figure>
<a href="/drawloom/media/a-place-to-do-the-work/13-operator-story-workspace.jpg"><img src="/drawloom/media/a-place-to-do-the-work/13-operator-story-workspace.jpg" width="1229" height="768" loading="lazy" alt="The Coco Comes to Visit working draft in Operator: a three-part story arc, a storyboard with a separate cover and twelve pages, and the Codex conversation below." /></a>
<figcaption>Inside an individual story: the arc and storyboard stay alongside the conversation. This local staging view contains a working draft and test conversation, not finished illustrations or a published book.</figcaption>
</figure>

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
workbenches. Each product keeps its own interface, business rules and way of
working. Drawloom provides shared capabilities for context, execution, tools
and controls, so each product does not have to build them again.

The boundaries matter. A provider can manage its agent's conversation without
owning the business's memory. Asking for a tool is not permission to use it.
Granting permission is not the same as enforcing limits on the machine where
it runs. Drawloom keeps those responsibilities separate and replaceable.

<figure class="architecture-figure architecture-wide" id="drawloom-capabilities" aria-describedby="drawloom-map-caption">
<p class="diagram-kicker">Drawloom · Shared foundations, distinct responsibilities</p>
<a href="/drawloom/artwork/why-drawloom/drawloom.svg" aria-label="Enlarge the Drawloom capability diagram"><img src="/drawloom/artwork/why-drawloom/drawloom.svg" width="2136" height="1128" loading="lazy" alt="Your workbench sits outside Drawloom. Orchestration coordinates work; memory and knowledge inform compiled context for agent execution. A tool request passes through policy and approval, tools, and sandbox constraints. Observability informs evaluation. Model inference is a separate capability." /></a>
<figcaption id="drawloom-map-caption">Eleven logical capabilities, not eleven services or a finished runtime. Arrows show selected relationships, not every call. <a href="/drawloom/artwork/why-drawloom/drawloom.svg">Enlarge diagram ↗</a></figcaption>
<details class="diagram-description">
<summary>Read the diagram</summary>
<p>The workbench owns the interface and business rules. The application chooses independently replaceable implementations of Drawloom's capabilities.</p>
<ul>
<li data-capability="orchestration">Orchestration coordinates runs, steps and child work.</li>
<li data-capability="memory">Memory retains experience for future retrieval.</li>
<li data-capability="knowledge">Knowledge holds sources and claims with provenance.</li>
<li data-capability="context-compilation">Context compilation prepares input from memory, knowledge, instructions, policy and the task.</li>
<li data-capability="agent-execution">Agent execution provides interactive sessions; the provider keeps its inner agent loop and transcript, distinct from Drawloom memory.</li>
<li data-capability="model-inference">Model inference handles bounded model requests. It does not represent an agent loop.</li>
<li data-capability="policy-and-approval">Policy and approval decide whether an action is allowed.</li>
<li data-capability="tools">Tools validate and perform the allowed invocation.</li>
<li data-capability="sandbox">Sandbox enforces filesystem, process, network and resource limits.</li>
<li data-capability="observability">Observability records execution evidence from all capabilities, not only tools.</li>
<li data-capability="evaluation">Evaluation assesses executions and artifacts against declared criteria.</li>
</ul>
<p>Return paths and many cross-capability relationships are omitted. Sources: <a href="https://github.com/mafifi/drawloom/blob/main/docs/adr/0005-partition-agent-platform-capabilities.md">ADR 0005</a>, <a href="https://github.com/mafifi/drawloom/blob/main/docs/adr/0007-provider-neutral-agent-execution.md">ADR 0007</a> and <a href="https://github.com/mafifi/drawloom/blob/main/docs/adr/0008-tool-execution-and-exposure.md">ADR 0008</a>.</p>
</details>
</figure>

Drawloom is early. The boundaries are taking shape, and the work still needs
to prove itself in real use. I want it to be approachable for a small business,
with useful local or free-tier options wherever possible.

I have no wish to build a fourth elaborate system that misses the point.

The reason for all of this is still the same as it was in 2024: give Souphi
more time to be a doctor.
