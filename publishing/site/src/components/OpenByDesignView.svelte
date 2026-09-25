<script lang="ts">
  import type {LandingPageActions, OpenByDesignPresentation} from './landing-page';

  let {
    presentation,
    actions,
  }: {
    presentation: OpenByDesignPresentation;
    actions: Pick<LandingPageActions, 'openRepositoryHref' | 'articleHref'>;
  } = $props();
</script>

<section class="open-section" id="open-source" aria-labelledby="open-heading">
  <img class="open-thread" src={presentation.artwork.src} width={presentation.artwork.width} height={presentation.artwork.height} alt={presentation.artwork.alt} />
  <div class="shell open-inner">
    <p class="section-label">{presentation.sectionLabel}</p>
    <div class="section-intro">
      <h2 id="open-heading">{#each presentation.headingLines as line, index}{#if index > 0}<br />{/if}{line}{/each}</h2>
      <div class="section-copy">
        {#each presentation.paragraphs as paragraph}<p>{paragraph}</p>{/each}
        <a class="text-link" href={actions.openRepositoryHref}>{presentation.actionLabel} <img src={presentation.arrowIcon.src} width={presentation.arrowIcon.width} height={presentation.arrowIcon.height} alt={presentation.arrowIcon.alt} /></a>
      </div>
    </div>
  </div>
</section>

<section class="journal-feature" aria-labelledby="journal-heading">
  <div class="journal-grid shell">
    <p class="section-label">{presentation.journalLabel}</p>
    <article>
      <h2 id="journal-heading">{presentation.articleTitle}</h2>
      <p>{presentation.articleDescription}</p>
      <a class="text-link" href={actions.articleHref}>{presentation.articleActionLabel} <img src={presentation.arrowIcon.src} width={presentation.arrowIcon.width} height={presentation.arrowIcon.height} alt={presentation.arrowIcon.alt} /></a>
    </article>
  </div>
</section>
