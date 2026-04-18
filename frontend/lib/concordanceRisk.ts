/**
 * Shared with ConcordanceMeter and end-of-session report — keep in sync with live dashboard.
 */
export const LIVE_CONCORDANCE_THRESHOLDS: Record<string, number> = {
  "helios.distress": 0.65,
  "helios.stress": 0.7,
  "helios.fatigue": 0.7,
  "apollo.low_mood": 0.65,
  "apollo.low_energy": 0.65,
  "apollo.anhedonia": 0.65,
  "apollo.sleep_issues": 0.65,
  "apollo.nervousness": 0.7,
  "apollo.worry": 0.65,
};

export const LOOKBACK_MS = 60_000;

export type BiomarkerPoint = {
  model: string;
  name: string;
  value: number;
  ts_ms: number;
};

/**
 * Peak (value/threshold) in the lookback window × 70, capped at 100.
 * @param referenceEndMs — anchor for “now” (e.g. max ts across all dashboard events). Defaults to max biomarker ts.
 */
export function biomarkerWindowRisk(
  entries: BiomarkerPoint[],
  referenceEndMs?: number,
): {
  score: number;
  maxRatio: number;
  latestTs: number;
  dominantName: string;
} {
  if (entries.length === 0) {
    return { score: 0, maxRatio: 0, latestTs: referenceEndMs ?? 0, dominantName: "" };
  }
  const latestTs = referenceEndMs ?? Math.max(...entries.map((e) => e.ts_ms));
  const cutoff = latestTs - LOOKBACK_MS;
  let maxRatio = 0;
  let dominantName = "";
  for (const e of entries) {
    if (e.ts_ms < cutoff) continue;
    const key = `${e.model}.${e.name}`;
    const thr = LIVE_CONCORDANCE_THRESHOLDS[key];
    if (thr === undefined) continue;
    const r = e.value / thr;
    if (r > maxRatio) {
      maxRatio = r;
      dominantName = e.name;
    }
  }
  const score = Math.min(100, Math.round(maxRatio * 70));
  return { score, maxRatio, latestTs, dominantName };
}
