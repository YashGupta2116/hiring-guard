/** Two-sample Kolmogorov-Smirnov statistic: max distance between the two samples' empirical CDFs. Pure math. */
export function ksStatistic(sampleA: number[], sampleB: number[]): number {
  if (sampleA.length === 0 || sampleB.length === 0) return 0;
  const a = [...sampleA].sort((x, y) => x - y);
  const b = [...sampleB].sort((x, y) => x - y);
  const points = [...new Set([...a, ...b])].sort((x, y) => x - y);

  let maxDiff = 0;
  for (const point of points) {
    const cdfA = countLessOrEqual(a, point) / a.length;
    const cdfB = countLessOrEqual(b, point) / b.length;
    maxDiff = Math.max(maxDiff, Math.abs(cdfA - cdfB));
  }
  return maxDiff;
}

function countLessOrEqual(sorted: number[], value: number): number {
  let count = 0;
  for (const item of sorted) {
    if (item <= value) count++;
  }
  return count;
}
