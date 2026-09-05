---
version: alpha
name: Drawloom publishing proof
description: Provisional editorial styling for the ADR 0009 example, not product branding.
colors:
  primary: "#1447e6"
  ink: "#111111"
  muted: "#5b5d67"
  paper: "#ffffff"
typography:
  heading:
    fontFamily: Georgia, serif
    fontSize: 46px
    fontWeight: 700
    lineHeight: 1.08
    letterSpacing: -0.035em
  body:
    fontFamily: Arial, Helvetica, sans-serif
    fontSize: 18px
    fontWeight: 400
    lineHeight: 1.65
  caption:
    fontFamily: Arial, Helvetica, sans-serif
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.65
spacing:
  small: 12px
  gutter: 30px
  section: 38px
rounded:
  media: 5px
components:
  article:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
  link:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.primary}"
  caption:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.muted}"
    typography: "{typography.caption}"
---
# Editorial proof styling

## Overview

A restrained editorial article, not a marketing landing page or final brand.
An ImageGen layout concept informed the hierarchy; all text and controls are
native HTML and the explanatory diagram is deterministic Remotion source.

## Colors

White paper, near-black text and cobalt links/rules. No gradient, tint or shadow.

## Typography

Georgia headings and system sans-serif prose. Headline scales from 36 to 46px;
body becomes 17px on small screens. Video labels use a 1280×720 safe-area layout.

## Layout

One open reading column, maximum 1060px including 30px side padding. Mobile uses
20px side padding. Video is a responsive 16:9 frame. No card-based article layout.

## Elevation & Depth

Hierarchy comes from type and whitespace, with thin rules for media and sections.

## Shapes

The media frame has a small radius; diagram nodes have gently rounded corners.

## Components

Native video controls provide play/pause, seeking and fullscreen. No autoplay,
decorative progress controls, bespoke player or reader-side animation runtime.
The complete transcript is visible as ordinary text; downloads enable reuse.

## Do's and Don'ts

- Preserve semantic headings, visible keyboard focus and mobile readability.
- Keep the publishing-proof notice visible below the article title.
- Do not treat this provisional palette as a decision about product UI branding.
- Do not replace HTML with a raster screenshot of the concept.
