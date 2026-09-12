<script lang="ts">
  import type {HeroPresentation, LandingPageActions} from './landing-page';

  let {
    presentation,
    actions,
  }: {presentation: HeroPresentation; actions: LandingPageActions['hero']} = $props();
</script>

<section class="hero" aria-labelledby="hero-title">
  <img class="hero-art" src={presentation.artwork.src} width={presentation.artwork.width} height={presentation.artwork.height} alt={presentation.artwork.alt} />
  <div class="hero-shade"></div>
  <div class="hero-content shell">
    <p class="eyebrow">{presentation.eyebrow}</p>
    <h1 id="hero-title">{presentation.titleLines[0]}<br />{presentation.titleLines[1]}<br />{presentation.titleLines[2]}</h1>
    <p class="hero-deck">{presentation.deck}</p>
    <div class="hero-actions">
      <a class="primary-action" href={actions.primaryHref}>{presentation.primaryActionLabel} <img src={presentation.arrowIcon.src} width={presentation.arrowIcon.width} height={presentation.arrowIcon.height} alt={presentation.arrowIcon.alt} /></a>
      <a class="secondary-action" href={actions.secondaryHref}>{presentation.secondaryActionLabel}</a>
    </div>
    <div class="hero-notes" aria-label={presentation.principleNotesLabel}>
      {#each presentation.principleNotes as note}<span>{note}</span>{/each}
    </div>
  </div>
</section>
