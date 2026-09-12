<script lang="ts">
  import DecisionMapView from './DecisionMapView.svelte';
  import LandingHeroView from './LandingHeroView.svelte';
  import OpenByDesignView from './OpenByDesignView.svelte';
  import SiteHeaderView from './SiteHeaderView.svelte';
  import type {LandingPageActions, LandingPagePresentation} from './landing-page';

  let {
    presentation,
    actions,
  }: {presentation: LandingPagePresentation; actions: LandingPageActions} = $props();
</script>

<a class="skip" href={actions.skipHref}>{presentation.skipLabel}</a>
<div class="hero-shell">
  <SiteHeaderView presentation={presentation.header} actions={{homeHref: actions.homeHref, navigation: actions.navigation}} />
  <main id="main">
    <LandingHeroView presentation={presentation.hero} actions={actions.hero} />
    <DecisionMapView presentation={presentation.decisionMap} actions={actions.decisionStages} />
    <OpenByDesignView presentation={presentation.openByDesign} actions={{openRepositoryHref: actions.openRepositoryHref, articleHref: actions.articleHref}} />
  </main>
</div>
<footer class="site-footer">
  <div class="shell footer-inner">
    <a class="footer-brand" href={actions.homeHref}><img src={presentation.footer.logo.src} width={presentation.footer.logo.width} height={presentation.footer.logo.height} alt={presentation.footer.logo.alt} />{presentation.footer.brandName}</a>
    <p>{presentation.footer.statement}</p>
    <a href={actions.footerRepositoryHref}>{presentation.footer.repositoryLabel}</a>
  </div>
</footer>
