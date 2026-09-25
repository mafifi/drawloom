<script lang="ts">
  import type {DecisionMapPresentation, LandingPageActions} from './landing-page';

  let {
    presentation,
    actions,
  }: {
    presentation: DecisionMapPresentation;
    actions: {stages: LandingPageActions['decisionStages']; decisionsHref: string};
  } = $props();
</script>

<section class="decision-section" id="decision-map" aria-labelledby="decision-heading">
  <div class="shell">
    <p class="section-label">{presentation.sectionLabel}</p>
    <div class="section-intro">
      <h2 id="decision-heading">{#each presentation.headingLines as line, index}{#if index > 0}<br />{/if}{line}{/each}</h2>
      <div class="section-copy">
        <p>{presentation.body}</p>
        <p class="section-hint">{presentation.hint}</p>
      </div>
    </div>
  </div>
  <figure class="map-figure">
    <!-- The artwork's empty top and bottom margins are cropped by the view box, not by the image. -->
    <svg class="decision-map" viewBox="0 50 1672 650" role="group" aria-labelledby="decision-map-title decision-map-description">
      <title id="decision-map-title">{presentation.title}</title>
      <desc id="decision-map-description">{presentation.description}</desc>
      <image href={presentation.artwork.src} width={presentation.artwork.width} height={presentation.artwork.height} />
      {#each presentation.stages as stage}
        <a class="decision-map-link" href={actions.stages[stage.id]} aria-label={stage.ariaLabel}>
          <rect class="decision-map-hit" x={stage.hitX} y="70" width={stage.hitWidth} height="138" rx="4" />
          <text class="decision-map-label" x={stage.x} y="118" text-anchor={stage.textAnchor}>{stage.name}</text>
          {#each stage.summaryLines as line, index}
            <text class="decision-map-summary" x={stage.x} y={150 + index * 25} text-anchor={stage.textAnchor}>{line}</text>
          {/each}
        </a>
      {/each}
    </svg>
    <ol class="map-mobile-list shell" aria-label={presentation.interactionLabel}>
      {#each presentation.stages as stage}
        <li><a href={actions.stages[stage.id]}><span>{stage.number}</span>{stage.name}<small>{stage.summaryLines.join(' ')}</small></a></li>
      {/each}
    </ol>
    <figcaption class="map-footer shell">
      <span class="ruled-note">{presentation.footerNote}</span>
      <a class="ruled-note" href={actions.decisionsHref}>{presentation.footerActionLabel}</a>
    </figcaption>
  </figure>
</section>
