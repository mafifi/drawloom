<script lang="ts">
  import type {HeroPresentation, LandingPageActions} from './landing-page';

  let {
    presentation,
    actions,
  }: {presentation: HeroPresentation; actions: LandingPageActions['hero']} = $props();
</script>

<section class="hero" aria-labelledby="hero-title">
  <img class="hero-art" src={presentation.artwork.src} width={presentation.artwork.width} height={presentation.artwork.height} alt={presentation.artwork.alt} />
  <!-- Same coordinates and cropping as the artwork (object-fit: cover, centred), so the words stay on the shuttles and threads. -->
  <svg class="hero-labels" viewBox="0 0 {presentation.artwork.width} {presentation.artwork.height}" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
    {#each presentation.artworkLabels as label}
      <text class="hero-label hero-label-{label.tone}" x={label.x} y={label.y} text-anchor={label.tone === 'shuttle' ? 'middle' : 'start'}>{label.text}</text>
    {/each}
  </svg>
  <div class="hero-shade"></div>
  <div class="hero-content shell">
    <p class="hero-corner">{#each presentation.cornerNote as line}<span>{line}</span>{/each}</p>
    <p class="eyebrow">{presentation.eyebrow}</p>
    <h1 id="hero-title">{#each presentation.titleLines as line, index}{#if index > 0}<br />{/if}{line}{/each}</h1>
    <p class="hero-deck">{presentation.deck}</p>
    <div class="hero-actions">
      <a class="primary-action" href={actions.primaryHref}>{presentation.primaryActionLabel} <img src={presentation.arrowIcon.src} width={presentation.arrowIcon.width} height={presentation.arrowIcon.height} alt={presentation.arrowIcon.alt} /></a>
      <a class="secondary-action" href={actions.secondaryHref}>{presentation.secondaryActionLabel} <img src={presentation.arrowIcon.src} width={presentation.arrowIcon.width} height={presentation.arrowIcon.height} alt={presentation.arrowIcon.alt} /></a>
    </div>
    <div class="hero-notes" aria-label={presentation.notesLabel}>
      <ul>{#each presentation.leftNotes as note}<li>{note}</li>{/each}</ul>
      <ul>{#each presentation.rightNotes as note}<li>{note}</li>{/each}</ul>
    </div>
  </div>
</section>
