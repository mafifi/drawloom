<script lang="ts">
  import type {HeaderPresentation, LandingPageActions} from './landing-page';

  let {
    presentation,
    actions,
  }: {presentation: HeaderPresentation; actions: Pick<LandingPageActions, 'homeHref' | 'navigation'>} = $props();
</script>

<header class="site-header shell">
  <a class="brand" href={actions.homeHref} aria-label={presentation.homeLabel}>
    <img src={presentation.logo.src} width={presentation.logo.width} height={presentation.logo.height} alt={presentation.logo.alt} />
    <span>{presentation.brandName}</span>
  </a>
  <nav aria-label={presentation.navigationLabel}>
    {#each presentation.navigation as item}
      <a class:github-link={item.emphasis} href={actions.navigation[item.id]}>{item.label}</a>
    {/each}
  </nav>
</header>
