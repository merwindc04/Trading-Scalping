import type { Candle } from '@/types/market'

/* ============================================================
   HistoricalSimilarity engine (spec §11)

   Compares the most recent window's normalised shape + feature
   vector against every prior non-overlapping window in the
   corpus, ranks by similarity, and reads the realised forward
   outcome of each analogue.
   ============================================================ */

export interface HistoricalMatch {
  index: number
  time: Candle['time']
  similarity: number // 0..100
  forwardReturnPct: number
  outcome: 'Bullish continuation' | 'Range / Neutral' | 'Bearish reversal'
  window: Candle[]
}

export interface HistoricalReport {
  matchCount: number
  bullishPct: number
  neutralPct: number
  bearishPct: number
  topMatches: HistoricalMatch[]
  /** Sample size feeds the confidence engine. */
  sampleSize: number
}

/** Normalise a window to z-scored, base-0 shape for scale-free comparison. */
function featureVector(window: Candle[]): number[] {
  const closes = window.map((c) => c.close)
  const base = closes[0]
  const rel = closes.map((c) => (c - base) / base)
  const mean = rel.reduce((s, v) => s + v, 0) / rel.length
  const sd = Math.sqrt(rel.reduce((s, v) => s + (v - mean) ** 2, 0) / rel.length) || 1e-6
  return rel.map((v) => (v - mean) / sd)
}

function distance(a: number[], b: number[]): number {
  let s = 0
  for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2
  return Math.sqrt(s / a.length)
}

export function findHistoricalAnalogues(corpus: Candle[], windowLen = 50, forwardLen = 20): HistoricalReport {
  const recent = corpus.slice(-windowLen)
  const target = featureVector(recent)
  const matches: HistoricalMatch[] = []

  // Slide across history, leaving room for a forward outcome and avoiding overlap with `recent`.
  const lastStart = corpus.length - windowLen - forwardLen - 5
  for (let i = 0; i <= lastStart; i += 2) {
    const win = corpus.slice(i, i + windowLen)
    const d = distance(target, featureVector(win))
    const similarity = clampPct(100 * Math.exp(-d * 1.35))
    const entry = corpus[i + windowLen - 1].close
    const exit = corpus[i + windowLen - 1 + forwardLen].close
    const fwd = ((exit - entry) / entry) * 100
    matches.push({
      index: i,
      time: win[win.length - 1].time,
      similarity,
      forwardReturnPct: fwd,
      outcome: fwd > 0.4 ? 'Bullish continuation' : fwd < -0.4 ? 'Bearish reversal' : 'Range / Neutral',
      window: win,
    })
  }

  matches.sort((a, b) => b.similarity - a.similarity)
  const strong = matches.filter((m) => m.similarity >= 70)
  const pool = strong.length >= 8 ? strong : matches.slice(0, Math.max(24, Math.floor(matches.length * 0.15)))

  const bull = pool.filter((m) => m.outcome === 'Bullish continuation').length
  const bear = pool.filter((m) => m.outcome === 'Bearish reversal').length
  const neu = pool.length - bull - bear

  return {
    matchCount: pool.length,
    bullishPct: Math.round((bull / pool.length) * 100),
    neutralPct: Math.round((neu / pool.length) * 100),
    bearishPct: Math.round((bear / pool.length) * 100),
    topMatches: matches.slice(0, 5),
    sampleSize: pool.length,
  }
}

function clampPct(v: number): number {
  return Math.max(0, Math.min(99.5, v))
}
