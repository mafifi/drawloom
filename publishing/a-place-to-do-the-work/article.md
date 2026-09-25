---
title: Why Drawloom?
description: Three years, three attempts, one lesson.
draft: false
published: '2026-09-05'
media:
  video: episode-steps.mp4
  poster: episode-steps.png
---

My spouse, [Dr Souphi](https://drsouphi.com), is a phenomenal doctor who has
always wanted to run her own clinic. She would be the first to say she's at her
best looking after patients. Selling, running a clinic and keeping the books are
another matter.

But running your own business means doing all of those jobs, and too little of
her time goes on what she does best.

As AI models and coding assistants got smarter, I began to think I could help.
Ideas I'd carried around for years suddenly felt possible. I could build
software to take on the running of the business, and give her more time for
her patients.

That was the plan. It took me three attempts to work out what it really needed.

## Summer 2024: a working website, an unfinished idea

My first attempt gave Souphi a working website and a simple system for patient
records and invoicing. They were separate apps, but they did useful work.

<figure>
<a href="/media/a-place-to-do-the-work/09-legacy-public-reconstruction.png"><img src="/media/a-place-to-do-the-work/09-legacy-public-reconstruction.png" width="1892" height="680" loading="lazy" alt="Souphi's first homepage, with her portrait behind a large headline and links to the clinic and the academy." style="display:block;width:100%;height:auto" /></a>
<figcaption>Souphi's first website, in 2024.</figcaption>
</figure>

Marketing was the part I never cracked.

We had photos from patients who had agreed to share them. How could I turn those
into before-and-after images for social media? How could the software help tell
the story of her work?

In 2024, that was out of my reach. Looking back at the code, I can see marketing
features wired to placeholder services. I'd sketched a solution without making
it work.

I left her with something good enough to use. It was a long way from what I'd
imagined.

<figure>
<a href="/media/a-place-to-do-the-work/10-legacy-admin-reconstruction.png"><img src="/media/a-place-to-do-the-work/10-legacy-admin-reconstruction.png" width="1892" height="800" loading="lazy" alt="The first admin dashboard, with cards for appointments, inventory, patients, marketing and finances." style="display:block;width:100%;height:auto" /></a>
<figcaption>The dashboard I was aiming for. The figures are sample data.</figcaption>
</figure>

<figure class="architecture-figure" id="stack-2024">
<p class="diagram-kicker">2024 · Two separate apps</p>
<a href="/artwork/why-drawloom/stack-2024.svg" aria-label="Enlarge the 2024 architecture diagram"><img src="/artwork/why-drawloom/stack-2024.svg" width="1440" height="784" loading="lazy" alt="A public website on Cloudflare Pages, and a separate admin app using Firebase." /></a>
<figcaption>A public website, and a separate app for patient records and invoicing. <a href="/artwork/why-drawloom/stack-2024.svg">Enlarge diagram ↗</a></figcaption>
</figure>

## Spring 2025: surely the stack was the problem

The models had improved, and this time I was sure I could get it right.

I suspected my first design was holding me back: one app for the website and
another for admin. I wanted to join up the whole journey, from someone finding
Souphi on social media to becoming a patient.

So I built a new admin app, `souphi-admin`. It shared a database with the
public website, so both could work with the same data.

I was no longer writing every line with autocomplete helping. I could describe
what I wanted and have the model build whole components. I started again, with
bigger ambitions and much faster progress.

<figure class="architecture-figure" id="stack-2025">
<p class="diagram-kicker">2025 · One shared database</p>
<a href="/artwork/why-drawloom/stack-2025.svg" aria-label="Enlarge the 2025 architecture diagram"><img src="/artwork/why-drawloom/stack-2025.svg" width="1480" height="944" loading="lazy" alt="The public website and the souphi-admin app, both on Cloudflare Pages, sharing one database." /></a>
<figcaption>Two apps working with the same data. <a href="/artwork/why-drawloom/stack-2025.svg">Enlarge diagram ↗</a></figcaption>
</figure>

## Early 2026: faster code was not enough

By the start of 2026, I had to admit I'd failed again.

The code had drifted. I was going round in circles, rebuilding features I
thought I'd already built. The codebase was no longer worth rescuing.

And it went beyond Souphi's software. I had more than a dozen repositories of
half-finished projects, and GitHub's bots chased me daily about ageing and
vulnerable packages.

> I'd become much faster at writing code. I hadn't found a way to keep it coherent.

The third attempt started with one repository for all my projects and their
shared code, and a new stack built on Cloudflare Workers and Convex.

The bigger change was how I worked. The coding agents had clear boundaries and
instructions. Automated checks enforced the design rules. Tests and reviews
were part of every change.

For the first time, the codebase felt under control.

<figure class="architecture-figure" id="stack-2026">
<p class="diagram-kicker">2026 · Shared code, enforced rules</p>
<a href="/artwork/why-drawloom/stack-2026.svg" aria-label="Enlarge the 2026 architecture diagram"><img src="/artwork/why-drawloom/stack-2026.svg" width="1480" height="944" loading="lazy" alt="The public website and admin app on Cloudflare Workers, using Convex for data." /></a>
<figcaption>One repository, with automated checks around the work. <a href="/artwork/why-drawloom/stack-2026.svg">Enlarge diagram ↗</a></figcaption>
</figure>

The models now had APIs that put the marketing work within reach. I could
connect writing, images, narration and video to real software, instead of
moving everything between tools by hand.

By September 2026, the codebase was in much better shape. But marketing had
shown me a different problem.

## A month to automate what I could help create in two hours

First, I made a treatment explainer episode with Codex. It took a couple of
hours.

Then I spent a month building a system to make twenty more automatically.

<figure>
<a href="/media/a-place-to-do-the-work/02-public-episode-opening.png"><img src="/media/a-place-to-do-the-work/02-public-episode-opening.png" width="1892" height="800" loading="lazy" alt="The public opening of Treatment Episode 02, with an editorial introduction alongside a patient illustration." /></a>
<figcaption>One of the treatment explainers on Souphi's journal.</figcaption>
</figure>

To make the series repeatable, I broke production into 23 steps: the research,
the script and narration, each scene, and the finished video, ready for Souphi
to approve.

Every scene had its own work. Create the image. Bring it to life. Fit it to the
narration.

<!-- animation -->

Research and writing needed different tools from images, motion and speech. The
system had to track which steps depended on which, keep every result and
recover when something failed. So I built agent roles, provider connections,
retries and a map of the whole process.

<figure>
<a href="/media/a-place-to-do-the-work/03-programme-raw.png"><img src="/media/a-place-to-do-the-work/03-programme-raw.png" width="1892" height="800" loading="lazy" alt="The treatment episode production system, showing eight stages and 23 steps." /></a>
<figcaption>The production system: eight stages and 23 steps.</figcaption>
</figure>

<aside class="callout" aria-label="The cost of unattended work">
<p class="eyebrow">Who decides when to spend again?</p>
<p>If a paid video request times out, has it failed, or is the provider still making a video I'll be charged for? Is it safe to try again?</p>
<p>How many attempts should an unattended system pay for before it stops? What happens if an earlier scene changes after I've paid for the later ones?</p>
</aside>

An unattended system needs answers to all of these before you can leave it
running. In a workbench, I could make those spending decisions myself.

The automated system ran to something like 50,000 to 100,000 lines of code. I
think a workbench could have done the job in 10,000.

The two hours went into making an episode. The month went into building a
factory. I'd made the format repeatable before knowing whether the audience
liked it.

Changing the format now meant changing the machinery. I needed a faster way to
learn what worked for Souphi's audience. I'd built a faster way to repeat my
first answer.

## The light bulb moment

Alongside that work, I'd been using tools that showed me another way.

I used [Claude Design](https://www.anthropic.com/news/claude-design-anthropic-labs)
to make much better websites through conversation, comments and direct edits.
More recently, I turned to
[Codex Security](https://openai.com/index/codex-security-now-in-research-preview/)
to check my code, as I grew more concerned about what capable AI models mean for
security.

They do very different jobs. Both give you a place built around the work, with
an agent helping you do it. You can see what's happening and shape the result.
Codex and Claude Code had already taught me that in development.

In development, I'd long since stopped expecting one good prompt to produce the
finished result. Yet with marketing, I went straight back to it. Write enough
specification. Add enough agents. Somehow make the whole thing run.

> I was treating AI like a conventional program: input, process, output. I needed an assistant that could share the work.

Creative work changes as you do it. You hear a script and realise it drags. You
see a scene and want to take it somewhere else. You publish something and learn
what your audience really cares about.

The work needed a place where those decisions could happen as it took shape.

That's what I mean by a **workbench**: a place to keep the work, see it take
shape and direct the next change. Behind it, a **harness** gives the agent the
instructions, context, tools and controls it needs to help.

<figure>
<a href="/media/a-place-to-do-the-work/12-operator-annual-plan.jpg"><img src="/media/a-place-to-do-the-work/12-operator-annual-plan.jpg" width="1229" height="768" loading="lazy" alt="My story-production workbench, with the year's plan, story cards for script, images and narration, and the Codex conversation below." /></a>
<figcaption>My story-production workbench: the plan, the stories and the conversation, side by side.</figcaption>
</figure>

## A better place to make an episode

Imagine having the sources, script, scenes and narration in one place. I could
ask the assistant to shorten a section, try another image or compare two
versions. I could see what changed and decide what to keep.

The useful parts would still run on their own. Research could be prepared,
approved scenes generated and edits assembled. Medical review would still
matter. And I'd decide whether another attempt was worth paying for.

It would have been less to build. More importantly, I could have learned from
each episode and made the next one better for the audience.

That's the workbench I wish I'd built.

<figure>
<a href="/media/a-place-to-do-the-work/13-operator-story-workspace.jpg"><img src="/media/a-place-to-do-the-work/13-operator-story-workspace.jpg" width="1229" height="768" loading="lazy" alt="A story in progress, with a three-part outline, a storyboard of a cover and twelve pages, and the Codex conversation below." /></a>
<figcaption>Inside a story: the outline and storyboard sit alongside the conversation.</figcaption>
</figure>

## Why Drawloom?

I now believe purpose-built workbenches are the best way to do complex, creative
business work with AI.

Marketing is one example. The same question applies to every other job around
Souphi's practice: where could a capable assistant, with the right tools and
controls, give her time back?

We don't have to build every part from scratch.
[Codex](https://developers.openai.com/codex/app-server) and
[Claude](https://code.claude.com/docs/en/agent-sdk/overview) already give us a
lot to build on. But every workbench still needs the same things around the
agent: context, memory, knowledge, tools, approvals and more.

That's why I'm building Drawloom. It provides the shared parts every workbench
needs, so each one doesn't have to build them again. You keep your own screens,
your own rules and your own way of working, and you stay in control of what the
agent does.

<figure class="architecture-figure architecture-wide" id="drawloom-capabilities" aria-describedby="drawloom-map-caption">
<p class="diagram-kicker">Drawloom · Ten shared capabilities</p>
<a href="/artwork/why-drawloom/drawloom.svg" aria-label="Enlarge the Drawloom capability diagram"><img src="/artwork/why-drawloom/drawloom.svg" width="2136" height="1128" loading="lazy" alt="Your workbench sits outside Drawloom. Orchestration coordinates the work. Memory, knowledge and orchestration feed the context the agent needs, which goes to the agent integration. When the agent asks to use a tool, policy and approval decide, tools run it and the sandbox limits it. Observability records what happened, and evaluation checks the results." /></a>
<figcaption id="drawloom-map-caption">The 10 capabilities Drawloom provides for every workbench. <a href="/artwork/why-drawloom/drawloom.svg">Enlarge diagram ↗</a></figcaption>
</figure>

Drawloom is early, and I want it to be easy for a small business to start with.
I have no wish to build a fourth elaborate system that misses the point.

The reason for all of this is the same as it was in 2024: give Souphi more time
to be a doctor.

Drawloom is free and open source. [Try the preview for Mac](https://github.com/mafifi/drawloom/releases/tag/v0.0.0-preview.1),
or [see how we built it](/principles/).
