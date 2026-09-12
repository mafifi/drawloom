<script lang="ts">
  import type {DecisionMapPresentation, LandingPageActions} from './landing-page';

  let {
    presentation,
    actions,
  }: {presentation: DecisionMapPresentation; actions: LandingPageActions['decisionStages']} = $props();
</script>

<section class="decision-section" id="decision-map" aria-labelledby="decision-heading">
  <div class="decision-intro shell">
    <p class="section-label">{presentation.sectionLabel}</p>
    <div>
      <h2 id="decision-heading">{presentation.heading}</h2>
      <p>{presentation.body}</p>
    </div>
  </div>
  <figure class="map-figure shell">
    <svg class="decision-map" viewBox="0 0 1672 941" role="group" aria-labelledby="decision-map-title decision-map-description">
      <title id="decision-map-title">{presentation.title}</title>
      <desc id="decision-map-description">{presentation.description}</desc>
      <image href={presentation.artwork.src} width={presentation.artwork.width} height={presentation.artwork.height} />
      {#each presentation.stages as stage}
        <a class="decision-map-link" href={actions[stage.id]} aria-label={stage.ariaLabel}>
          <rect class="decision-map-hit" x={stage.hitX} y="55" width={stage.hitWidth} height="158" rx="4" />
          <text class="decision-map-number" x={stage.x} y="104" text-anchor={stage.textAnchor}>{stage.number}</text>
          <text class="decision-map-label" x={stage.x} y="143" text-anchor={stage.textAnchor}>{stage.name}</text>
          {#each stage.summaryLines as line, index}
            <text class="decision-map-summary" x={stage.x} y={172 + index * 23} text-anchor={stage.textAnchor}>{line}</text>
          {/each}
        </a>
      {/each}
    </svg>
    <ol class="map-mobile-list" aria-label={presentation.interactionLabel}>
      {#each presentation.stages as stage}
        <li><a href={actions[stage.id]}><span>{stage.number}</span>{stage.name}<small>{stage.summaryLines.join(' ')}</small></a></li>
      {/each}
    </ol>
    <figcaption>{presentation.caption}</figcaption>
  </figure>
</section>
