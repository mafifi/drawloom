import {defineCollection} from 'astro:content';
import {glob} from 'astro/loaders';
import {articleMetadata, articleSlug} from './article-metadata';

const generateId = ({entry}: {entry: string}) => articleSlug.parse(entry.split('/')[0]);

const articles = defineCollection({
  loader: glob({pattern: '*/article.md', base: '..', generateId}),
  schema: articleMetadata,
});
const transcripts = defineCollection({
  loader: glob({pattern: '*/transcript.md', base: '..', generateId}),
});
export const collections = {articles, transcripts};
