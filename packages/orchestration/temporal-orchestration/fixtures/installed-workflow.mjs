import { z } from 'zod';

const label = { id: 'catalog-label', version: '1', input: z.string(), output: z.string() };
export const catalog = { id: 'catalog-entry', version: '1', input: z.string(), output: z.string(),
  async run(context, input) {
    const prepared = await context.task('prepare-label', label, input);
    const approved = await context.input('confirm-label', z.boolean());
    return approved ? `${prepared}:confirmed` : `${prepared}:declined`;
  },
};
export default { workflows: [catalog], tasks: [label] };
