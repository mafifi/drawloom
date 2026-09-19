export function markdownLink(value: string): string | undefined {
  if (/\s/.test(value) || !/^https?:\/\//i.test(value)) return;
  try {
    const url = new URL(value);
    if (url.username || url.password) return;
    return url.href;
  } catch {
    return;
  }
}
