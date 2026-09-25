import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "zod";
import { articleMetadata, articleSlug } from "./article-metadata";
import { exploreMetadata, exploreSteps } from "./explore-metadata";

const generateId = ({ entry }: { entry: string }) => articleSlug.parse(entry.split("/")[0]);

const articles = defineCollection({
  loader: glob({ pattern: "*/article.md", base: "..", generateId }),
  schema: articleMetadata,
});
const transcripts = defineCollection({
  loader: glob({ pattern: "*/transcript.md", base: "..", generateId }),
});
const explore = defineCollection({
  loader: glob({
    pattern: "explore/*/page.md",
    base: "..",
    generateId: ({ entry }) => z.enum(exploreSteps).parse(entry.split("/")[1]),
  }),
  schema: exploreMetadata,
});
export const collections = { articles, transcripts, explore };
