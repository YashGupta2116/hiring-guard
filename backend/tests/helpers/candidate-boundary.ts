/**
 * Rules.md §9.1: nothing reachable with a join/candidate token may include scores, flags,
 * thresholds, weights, sensitivity, hidden test data or report data. Scans a response payload
 * recursively for keys that would leak any of that.
 */
const FORBIDDEN_KEY_PATTERN =
  /^(score|integrity|flag|flags|severity|narrative|threshold|thresholds|weight|weights|sensitivity|channel(s|List)?|hiddenTest|hiddenTests|passCount|reportData|evidenceFrame)$/i;

export function findForbiddenKeys(payload: unknown, path = ""): string[] {
  if (payload === null || typeof payload !== "object") {
    return [];
  }
  if (Array.isArray(payload)) {
    return payload.flatMap((item, i) => findForbiddenKeys(item, `${path}[${i}]`));
  }

  const hits: string[] = [];
  for (const [key, value] of Object.entries(payload)) {
    const fullPath = path ? `${path}.${key}` : key;
    if (FORBIDDEN_KEY_PATTERN.test(key)) {
      hits.push(fullPath);
    }
    hits.push(...findForbiddenKeys(value, fullPath));
  }
  return hits;
}

export function assertNoForbiddenKeys(payload: unknown): void {
  const hits = findForbiddenKeys(payload);
  if (hits.length > 0) {
    throw new Error(`Candidate-facing payload leaked forbidden keys: ${hits.join(", ")}`);
  }
}
