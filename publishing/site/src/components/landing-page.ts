export type NavigationId = "why" | "process" | "decisions" | "journal" | "github";
export type DecisionStageId =
  | "principles"
  | "questions"
  | "investigations"
  | "decisions"
  | "evidence"
  | "implementation";

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
  navigation: ReadonlyArray<{ id: NavigationId; label: string; emphasis?: boolean }>;
}

/** A decorative word placed on the hero artwork, in its 1672×941 coordinates. */
export interface ArtworkLabel {
  text: string;
  x: number;
  y: number;
  tone: "shuttle" | "thread";
}

export interface HeroPresentation {
  artwork: ImagePresentation;
  artworkLabels: readonly ArtworkLabel[];
  eyebrow: string;
  titleLines: readonly string[];
  deck: string;
  primaryActionLabel: string;
  secondaryActionLabel: string;
  cornerNote: readonly string[];
  notesLabel: string;
  leftNotes: readonly string[];
  rightNotes: readonly string[];
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
  textAnchor: "start" | "middle" | "end";
}

export interface DecisionMapPresentation {
  sectionLabel: string;
  headingLines: readonly string[];
  body: string;
  hint: string;
  interactionLabel: string;
  artwork: ImagePresentation;
  title: string;
  description: string;
  footerNote: string;
  footerActionLabel: string;
  stages: readonly DecisionStagePresentation[];
}

export interface OpenByDesignPresentation {
  artwork: ImagePresentation;
  sectionLabel: string;
  headingLines: readonly string[];
  paragraphs: readonly string[];
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
  hero: Readonly<{ primaryHref: string; secondaryHref: string }>;
  decisionStages: Readonly<Record<DecisionStageId, string>>;
  decisionsHref: string;
  openRepositoryHref: string;
  articleHref: string;
  footerRepositoryHref: string;
}
