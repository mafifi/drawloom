import { z } from "zod";

// "How we decide": the six steps of the landing page's decision map. Each has
// one page at /<slug>/, authored in publishing/explore/<slug>/page.md.
export const exploreSteps = [
  "principles",
  "questions",
  "research",
  "decisions",
  "evidence",
  "get-started",
] as const;
export type ExploreStep = (typeof exploreSteps)[number];

export const exploreMetadata = z.object({
  step: z.number().int().min(1).max(exploreSteps.length),
  title: z.string().trim().min(1),
  question: z.string().trim().min(1),
  summary: z.string().trim().min(1).max(200),
  draft: z.boolean().default(true),
});
