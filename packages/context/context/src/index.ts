import { z } from "zod";
export const CompiledContextSchema = z.strictObject({
  text: z.string(),
  sources: z.array(z.string().min(1)).optional(),
});
export type CompiledContext = z.infer<typeof CompiledContextSchema>;
