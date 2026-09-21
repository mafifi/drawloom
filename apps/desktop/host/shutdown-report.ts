/** Renders cleanup failures for the operator.
 *
 * PRIVACY BOUNDARY. A cause may carry a provider's captured stderr, which can
 * contain filesystem paths, credentials or user content. It reaches this
 * process's stderr only: HTTP errors match a fixed allow-list of messages and
 * never read `cause`, and telemetry records an outcome and status rather than
 * exception text. Causes are additionally withheld unless diagnostics are
 * explicitly requested, so ordinary logs a user might share stay free of
 * provider output.
 */
export function describeShutdownFailures(
  reasons: readonly unknown[],
  options: { diagnostics: boolean },
): string[] {
  const lines: string[] = [];
  const describe = (reason: unknown, depth: number): void => {
    const indent = "  ".repeat(depth);
    if (reason instanceof AggregateError) {
      lines.push(`${indent}${reason.message}`);
      for (const inner of reason.errors) describe(inner, depth + 1);
      return;
    }
    lines.push(
      indent + (reason instanceof Error ? (reason.stack ?? reason.message) : String(reason)),
    );
    if (reason instanceof Error && reason.cause !== undefined)
      lines.push(
        options.diagnostics
          ? `${indent}  ${reason.cause instanceof Error ? (reason.cause.stack ?? reason.cause.message) : String(reason.cause)}`
          : `${indent}  (captured provider output withheld; set DRAWLOOM_DIAGNOSTICS=1 to include it)`,
      );
  };
  for (const reason of reasons) describe(reason, 0);
  return lines;
}
