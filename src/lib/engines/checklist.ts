import { TIMEFRAME_SECONDS } from '@/types/market'
import type { Analysis } from '@/lib/analyze'
import type { RangeUse } from './moveTracker'
import { indicatorVotes } from './moveTracker'

/* ============================================================
   Buy / Sell checklist — the few conditions that matter most,
   ticked live. Three are REQUIRED (proven edge, signal, a close
   beyond the confirmation level); the rest are about TIMING.

   It never invents a trade: it checks the direction the app
   already leans (the signal, or the market bias when the signal
   is WAIT) and says plainly when to wait.
   ============================================================ */

export type CheckState = 'pass' | 'fail' | 'pending'
export type CheckSide = 'BUY' | 'SELL'

export interface CheckItem {
  key: string
  label: string
  required: boolean
  state: CheckState
  /** Short live value, e.g. "54% vs 50% guess" or "1 : 2.4". */
  value: string
  /** What it means / what to wait for. */
  hint: string
}

export type ChecklistVerdict = 'go' | 'timing' | 'wait' | 'none'

export interface Checklist {
  side: CheckSide | null
  /** True when the app itself shows BUY/SELL (not only a lean). */
  fromSignal: boolean
  items: CheckItem[]
  met: number
  total: number
  verdict: ChecklistVerdict
  headline: string
  detail: string
}

/** Thresholds (kept in one place so the UI text matches the logic). */
export const CHECK_RULES = {
  maxRangeUsed: 0.7,
  minAlignment: 60,
  minIndicatorShare: 0.5,
  minRR: 2,
}

/** The side the app leans: its signal, else the market bias, else none. */
export function autoSide(a: Analysis): CheckSide | null {
  const sig = a.decision.signal
  return sig === 'BUY' ? 'BUY' : sig === 'SELL' ? 'SELL' : a.bias === 'BULLISH' ? 'BUY' : a.bias === 'BEARISH' ? 'SELL' : null
}

/** `forceSide` lets the user check a side the app is not leaning (e.g. "what would a SELL need?"). */
export function buildChecklist(a: Analysis, price: number, range: RangeUse | null, nowSec: number, forceSide?: CheckSide): Checklist {
  const d = a.decision
  const sig = d.signal
  const side: CheckSide | null = forceSide ?? autoSide(a)
  const fromSignal = sig === side

  if (!side) {
    return {
      side: null,
      fromSignal: false,
      items: [],
      met: 0,
      total: 0,
      verdict: 'none',
      headline: 'No direction — wait',
      detail: 'The market has no clear lean on this setting. Pick Buy or Sell above to see what each would still need.',
    }
  }

  const buy = side === 'BUY'
  const p = a.precision
  const f = (v: number) => v.toFixed(p)
  const items: CheckItem[] = []

  // 1 · Proven edge (required)
  const g = a.edgeGate
  items.push({
    key: 'edge',
    label: 'Proven edge on this setting',
    required: true,
    state: g.allows ? 'pass' : 'fail',
    value: g.calls > 0 ? `${g.label} · ${Math.round(g.hitRate * 100)}% vs ${Math.round(g.baseline * 100)}% guess` : g.label,
    hint: g.allows ? 'Past calls here beat guessing.' : 'Past calls here did not beat guessing — try a green cell on the Backtesting page.',
  })

  // 2 · The signal itself (required)
  items.push({
    key: 'signal',
    label: `Signal says ${side}`,
    required: true,
    state: sig === side ? 'pass' : 'fail',
    value: d.signalLabel,
    hint:
      sig === side
        ? 'The app shows an actionable signal.'
        : autoSide(a) === side
          ? `Only a ${buy ? 'bullish' : 'bearish'} lean — the app is not calling ${side} yet.`
          : `The app is not calling ${side} (it shows ${d.signalLabel}).`,
  })

  // 3 · Candle close beyond the confirmation level (required). Uses the last CLOSED bar.
  const conf = buy ? d.confirmation.bull : d.confirmation.bear
  const tfSec = TIMEFRAME_SECONDS[a.timeframe]
  const cs = a.candles
  const last = cs[cs.length - 1]
  const closed = last && last.time + tfSec <= nowSec ? last : cs[cs.length - 2]
  const confirmed = closed ? (buy ? closed.close > conf : closed.close < conf) : false
  items.push({
    key: 'confirm',
    label: `Candle closed ${buy ? 'above' : 'below'} confirmation`,
    required: true,
    state: !closed || !(conf > 0) ? 'pending' : confirmed ? 'pass' : 'fail',
    value: closed ? `close ${f(closed.close)} · CONF ${f(conf)}` : '—',
    hint: confirmed ? 'Breakout confirmed by a closed candle.' : `Wait for a ${a.timeframe} candle to close ${buy ? 'above' : 'below'} ${f(conf)}.`,
  })

  // 4 · Room left today (timing)
  const maxUsed = CHECK_RULES.maxRangeUsed
  items.push({
    key: 'room',
    label: 'Room left in today’s move',
    required: false,
    state: !range ? 'pending' : range.used < maxUsed ? 'pass' : 'fail',
    value: range ? `${Math.floor(range.used * 100)}% of a normal day used (limit ${maxUsed * 100}%)` : 'loading…',
    hint: !range ? 'Loading today’s range.' : range.used < maxUsed ? 'Still room to move today.' : 'Most of a normal day’s move is done — chasing is risky; wait for a pullback.',
  })

  // 5 · Timeframes agree (timing)
  const dirWord = buy ? 'BULLISH' : 'BEARISH'
  const aligned = a.mtf.dominant === dirWord && a.mtf.alignmentPct >= CHECK_RULES.minAlignment
  items.push({
    key: 'mtf',
    label: 'Timeframes agree',
    required: false,
    state: a.mtf.rows.length ? (aligned ? 'pass' : 'fail') : 'pending',
    value: `${Math.round(a.mtf.alignmentPct)}% ${a.mtf.dominant.toLowerCase()}`,
    hint: aligned ? 'Higher and lower timeframes point the same way.' : 'Timeframes are mixed or point the other way.',
  })

  // 6 · Indicators lean the same way (timing)
  const v = indicatorVotes(a.technical.readings)
  const mine = buy ? v.bull : v.bear
  const theirs = buy ? v.bear : v.bull
  const okVotes = v.total > 0 && mine > theirs && mine / v.total >= CHECK_RULES.minIndicatorShare
  items.push({
    key: 'votes',
    label: `Most indicators ${buy ? 'bullish' : 'bearish'}`,
    required: false,
    state: v.total ? (okVotes ? 'pass' : 'fail') : 'pending',
    value: `${mine} of ${v.total} (${theirs} against)`,
    hint: okVotes ? 'Indicators back the move.' : 'Indicators are split — no conviction.',
  })

  // 7 · Risk / reward from the live price (timing). Uses the app's trade setup when it is
  // for this side; otherwise the nearest zones (target = next zone ahead, stop = zone behind).
  const s = a.setup
  const L = d.levels
  const useSetup = s.bias === dirWord && s.targets.length > 0
  const target = useSetup ? s.targets[0] : buy ? L.immediateResistance.bottom : L.immediateSupport.top
  const stop = useSetup ? s.invalidation : buy ? L.immediateSupport.bottom : L.immediateResistance.top
  const reward = buy ? target - price : price - target
  const risk = buy ? price - stop : stop - price
  const rr = reward > 0 && risk > 0 ? reward / risk : null
  items.push({
    key: 'rr',
    label: `Risk / reward at least 1 : ${CHECK_RULES.minRR}`,
    required: false,
    state: rr == null ? 'fail' : rr >= CHECK_RULES.minRR ? 'pass' : 'fail',
    value: rr == null ? 'no clear target / stop' : `1 : ${rr.toFixed(1)} (target ${f(target)} · stop ${f(stop)})`,
    hint:
      rr == null
        ? 'Price is sitting on a level — no room between target and stop yet.'
        : rr >= CHECK_RULES.minRR
          ? 'The target pays enough for the risk.'
          : 'Too little reward for the risk — a better entry is closer to the stop.',
  })

  const met = items.filter((i) => i.state === 'pass').length
  const total = items.length
  const reqOk = items.filter((i) => i.required).every((i) => i.state === 'pass')
  const timingOk = items.filter((i) => !i.required).every((i) => i.state === 'pass')
  const firstMissing = items.find((i) => i.state !== 'pass')

  const verdict: ChecklistVerdict = reqOk && timingOk ? 'go' : reqOk ? 'timing' : 'wait'
  const headline =
    verdict === 'go'
      ? `All conditions met — ${side} setup`
      : verdict === 'timing'
        ? `${side} is valid, but timing is poor`
        : `Wait — ${met} of ${total} met`
  const detail =
    verdict === 'go'
      ? `Every check passes. Exit at the target, or if a candle closes beyond the stop (${f(stop)}).`
      : `Next to watch: ${firstMissing?.label.toLowerCase() ?? 'conditions'} — ${firstMissing?.hint ?? ''}`

  return { side, fromSignal, items, met, total, verdict, headline, detail }
}
