import {z} from 'zod';

// Piece-directory slugs own identity. Media paths are relative to that piece's
// generated media directory; neither URLs nor parent-directory traversal belong here.
const mediaFile = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/);
export const articleSlug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
export const articleMetadata = z.object({
  title: z.string().trim().min(1),
  description: z.string().trim().min(1),
  draft: z.boolean().default(true),
  published: z.iso.date().optional(),
  media: z.object({video: mediaFile.regex(/\.mp4$/), poster: mediaFile.regex(/\.(png|webp|jpg)$/)}).optional(),
}).refine((entry) => entry.draft || entry.published !== undefined, {
  message: 'Published articles require a publication date', path: ['published'],
});
