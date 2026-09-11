import { z } from 'zod';

const Index = z.array(z.strictObject({ topic: z.string().min(1).max(100), title: z.string().min(1).max(160) })).max(8);

/** Disposable routing experiment, not a public memory/index contract. */
export function indexContext(input: unknown): string {
  return '\nAvailable retained-note topics (metadata only; read the relevant note before using it):\n'
    + JSON.stringify(Index.parse(input));
}
