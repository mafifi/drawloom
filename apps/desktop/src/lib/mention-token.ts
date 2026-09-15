export function mentionToken(text: string, start: number, end = start) {
  if (start !== end) return undefined;
  const match = /(?:^|\s)([$@])([^\s$@]*)$/.exec(text.slice(0, start));
  if (!match) return undefined;
  return {
    kind: match[1] === "$" ? ("skill" as const) : ("context" as const),
    start: start - match[2]!.length - 1,
    end: start,
  };
}
