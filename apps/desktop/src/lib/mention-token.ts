export function mentionToken(text: string, start: number, end = start) {
  if (start !== end) return undefined;
  if (/^\/[^\s/]*$/.test(text.slice(0, start)))
    return { kind: "action" as const, start: 0, end: start };
  const match = /(?:^|\s)([$@])([^\s$@]*)$/.exec(text.slice(0, start));
  if (!match) return undefined;
  return {
    kind: match[1] === "$" ? ("skill" as const) : ("context" as const),
    start: start - match[2]!.length - 1,
    end: start,
  };
}
