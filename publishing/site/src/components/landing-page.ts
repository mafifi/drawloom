export type NavigationId = 'why' | 'process' | 'decisions' | 'journal' | 'github';
export type DecisionStageId = 'principles' | 'questions' | 'investigations' | 'decisions' | 'evidence' | 'implementation';

export interface ImagePresentation {
  src: string;
  width: number;
  height: number;
  alt: string;
}

export interface HeaderPresentation {
  brandName: string;
  homeLabel: string;
  logo: ImagePresentation;
  navigationLabel: string;
  navigation: ReadonlyArray<{id: NavigationId; label: string; emphasis?: boolean}>;
}

export interface HeroPresentation {
  artwork: ImagePresentation;
  eyebrow: string;
  titleLines: readonly string[];
  deck: string;
  primaryActionLabel: string;
  secondaryActionLabel: string;
  principleNotesLabel: string;
  principleNotes: readonly string[];
  arrowIcon: ImagePresentation;
}

export interface DecisionStagePresentation {
  id: DecisionStageId;
  number: string;
  name: string;
  ariaLabel: string;
  summaryLines: readonly string[];
  x: number;
  hitX: number;
  hitWidth: number;
  textAnchor: 'start' | 'middle' | 'end';
}

export interface DecisionMapPresentation {
  sectionLabel: string;
  heading: string;
  body: string;
  interactionLabel: string;
  artwork: ImagePresentation;
  title: string;
  description: string;
  caption: string;
  stages: readonly DecisionStagePresentation[];
}

export interface OpenByDesignPresentation {
  artwork: ImagePresentation;
  sectionLabel: string;
  headingLines: readonly string[];
  body: string;
  actionLabel: string;
  journalLabel: string;
  articleTitle: string;
  articleDescription: string;
  articleActionLabel: string;
  arrowIcon: ImagePresentation;
}

export interface FooterPresentation {
  brandName: string;
  statement: string;
  repositoryLabel: string;
  logo: ImagePresentation;
}

export interface LandingPagePresentation {
  skipLabel: string;
  header: HeaderPresentation;
  hero: HeroPresentation;
  decisionMap: DecisionMapPresentation;
  openByDesign: OpenByDesignPresentation;
  footer: FooterPresentation;
}

export interface LandingPageActions {
  skipHref: string;
  homeHref: string;
  navigation: Readonly<Record<NavigationId, string>>;
  hero: Readonly<{primaryHref: string; secondaryHref: string}>;
  decisionStages: Readonly<Record<DecisionStageId, string>>;
  openRepositoryHref: string;
  articleHref: string;
  footerRepositoryHref: string;
}
