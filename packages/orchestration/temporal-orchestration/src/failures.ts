import { z } from 'zod';
const Code = z.enum(['retryable', 'denied', 'invalid', 'unknown']);
/** Trusted backend bundles may carry a separate copy of the contract class.
 * Accept actual Error instances with only the contract's known code values;
 * arbitrary objects, transport error codes and non-errors remain unknown.
 */
export function stepFailureCode(error: unknown): z.infer<typeof Code> | undefined {
  if (!(error instanceof Error) || !['Error', 'StepFailure'].includes(error.name)) return undefined;
  const result = Code.safeParse(Reflect.get(error, 'code'));
  return result.success ? result.data : undefined;
}
