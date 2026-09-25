import { getCollection } from "astro:content";

/** The "How we decide" pages a build may show, in map order. Drafts only in preview. */
export async function exploreEntries() {
  const preview = process.env.JOURNAL_DRAFTS === "1";
  return (await getCollection("explore", ({ data }) => preview || !data.draft)).sort(
    (a, b) => a.data.step - b.data.step,
  );
}
