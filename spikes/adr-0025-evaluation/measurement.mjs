/** @param {Array<[number, number]>} intervals */
export function coveredMilliseconds(intervals) {
  let total = 0, start = 0, end = 0;
  for (const [left, right] of [...intervals].sort((a, b) => a[0] - b[0])) {
    if (left > end) { total += end - start; start = left; end = right; }
    else end = Math.max(end, right);
  }
  return total + end - start;
}
