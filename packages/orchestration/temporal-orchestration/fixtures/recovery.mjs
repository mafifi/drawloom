import { z } from "zod";
export const write = { id: "write", version: "1", input: z.number(), output: z.number() };
export const slow = { ...write, id: "slow", limits: { startToCloseTimeoutMs: 500 } };
export const review = { id: "review", version: "1", input: z.number(), output: z.number(), async run(context, value) { const result = await context.task("write", write, value); await context.input("review", z.null()); return result; } };
export const active = { ...review, id: "active", run: (context, value) => context.task("slow", slow, value) };
export const transformed = { id: 'transformed-review', version: '1', input: z.null(), output: z.string(), run: context => context.input('review', z.string().transform(value => value.trim())) };
export default { workflows: [review, active, transformed], tasks: [write, slow] };
