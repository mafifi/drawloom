---
title: Free to use and share
description: Clean licences, all the way down.
draft: true
---

Drawloom is for people who want to build their own AI workbench. Some will be
developers trying an idea. Others will run a business and want tools that fit
the way they work.

Either way, they need to know they can use what we give them. They need to be
free to change it, ship it inside their own product and share it with others.
If they can't, nothing else we build matters much.

That promise is easy to make. Keeping it is harder, because Drawloom is made of
many parts, and most of them come from other people.

## A promise about every part

Every piece of software comes with a licence. It sets out what you may do with
the code. Some licences, called permissive, let you do almost anything, as long
as you keep the original notices.

Others ask for more in return. The GPL family asks that anything you build with
the code is shared on the same terms. That's a fair deal for many projects. For
a business building its own product, it can be a reason to walk away.

So we set a rule. Every part of what Drawloom ships or asks you to
download must be free for anyone to use and share. That means permissive
licences, plus one we review with care, the Mozilla Public License. It means no
GPL, LGPL or AGPL, even the versions with special exceptions.

The rule covers more than the packages we choose ourselves. It covers what
those packages bring with them. It covers the runtimes that run our code and
the AI models we ask you to download.

That last part is where the rule gets tested.

## The first test: local search

Drawloom can search your own notes and documents on your Mac. To do that well,
it needs a small AI model that turns text into numbers a computer can compare.

My first choice ran on Apple's MLX framework. MLX itself uses a permissive
licence, and so does the model. But the library that connected them was under
the GPL.

I found another library that did the same job with a permissive licence. It
worked. It ran on the Mac's graphics chip and produced the results we needed.

Then we looked at what it installed. Buried in its standard setup was a
scientific package whose Mac version included compiler libraries under the GPL,
with an exception.

<!-- ASK: What went through your mind when the working option turned out to carry GPL code inside it? -->

We dropped it. We moved local search to llama.cpp, with a model Qwen publishes
under a permissive licence. It took more work, and it meant giving up something
that already ran.

It also taught us a lesson we'd need again. A licence on the front of a package
tells you about that package. It tells you nothing about what's inside.

## What the check couldn't see

We'd built a licence check into the project, so every change was checked
against the rule. It scanned every package we used and reported nothing to
worry about.

Then, in a review before we published Drawloom, we looked at how the desktop
app was built.

<!-- ASK: How close to the first preview release was this, and how did it feel to find it then? -->

Drawloom was built on Bun, a fast JavaScript runtime. A runtime is the engine
that runs your code. We used Bun to build the app, and it placed its own engine
inside the app we'd hand to people.

Bun's own licence is permissive. But Bun carries parts from other projects, and
two of them use the LGPL. One is the JavaScript engine from WebKit. The other is
a small compiler called TinyCC.

Our check had never seen them. It read the list of packages. The engine inside
the app was never on that list. The check reported a clean result because it
was looking in the wrong place.

## Why we moved instead of making an exception

There was another way out. The LGPL allows you to ship its code if you give
people the source and the means to rebuild it with their own changes.

We drafted that exception and tested how much it would cost. Bun uses its own
patched copy of WebKit. Its written steps for rebuilding didn't match how the
project really builds. We'd have had to write and maintain our own rebuild
steps, and repeat the work for every release.

And it would have broken the rule we'd already kept at real cost. We'd given up
a working search option to stay clean. Making an exception for the one part
every user runs would have made that rule meaningless.

So we changed the whole toolchain. Drawloom now runs on Node.js, and pnpm
manages its packages. We moved everything that depended on Bun, and we use
standard tools for testing and packaging.

It was the right moment to do it. Drawloom had no users and nothing in
production. There was nothing to migrate for anyone. The exception would have
grown with every Bun update. The move would cost us once.

<!-- ASK: Was there a moment you were tempted to take the exception and ship? -->

The move brought another benefit. Before, we developed on one runtime and would
have shipped another. Now the tests run on the same engine we ship. There's
one runtime to understand.

## Clean all the way down

Node has its own bundled parts, so we reviewed them too. We recorded the exact
Node build inside the app and read its full licence text. The licence check now
knows about that runtime. If someone changes it without recording it, the check
fails.

That's the lesson I'd pass on to anyone choosing what to build on. A clean
licence at the top means little on its own. You need to know what each part
carries inside it, and what it places inside what you ship.

For a business, that matters more than it first appears. If you build your
product on Drawloom, our licences become part of your story. You should be able
to trust them without auditing every layer yourself.

We did that work so you don't have to. Every part of Drawloom, all the way
down, is free for you to use and share.

Drawloom is free and open source. [Try the preview for Mac](https://github.com/mafifi/drawloom/releases/tag/v0.0.0-preview.1),
or [see the principles behind it](/principles/).
