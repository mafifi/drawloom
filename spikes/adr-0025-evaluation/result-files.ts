import { z } from "zod";
import { readFile, rename, writeFile } from "node:fs/promises";
import { evaluationResultSchema, feedbackSchema } from "./contract.ts";

export const resultFileSchema = z.object({ schemaVersion: z.literal(1), results: z.array(evaluationResultSchema), feedback: z.array(feedbackSchema) });
export type ResultFile = z.infer<typeof resultFileSchema>;

export async function saveResultFile(path: string, document: ResultFile): Promise<void> {
  const validated = resultFileSchema.parse(document);
  const temporary = `${path}.tmp`;
  await writeFile(temporary, `${JSON.stringify(validated, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temporary, path);
}
export async function loadResultFile(path: string): Promise<ResultFile> { return resultFileSchema.parse(JSON.parse(await readFile(path, "utf8"))); }
