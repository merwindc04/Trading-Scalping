import type { Candle, Timeframe } from '@/types/market'
import { TIMEFRAME_SECONDS } from '@/types/market'
import { ema, rsi, macd, atr, vwap } from './indicators'

/* ============================================================
   Short-term entry confirmation (1m → 30m).

   A rules-based "pullback-and-reclaim" entry, checked ONLY on
   CLOSED candles (the forming candle never confirms anything):

     REQUIRED
       1. Higher timeframe trend agrees (EMA20 vs EMA50 + close)
       2. Entry timeframe trend agrees (EMA9 vs EMA20 + VWAP side)
       3. A pullback into the EMA20 area that held above EMA50
       4. A trigger candle: strong close beyond the prior candle
     TIMING
       5. Momentum (RSI in range, MACD histogram turning)
       6. Clean volatility (no dead market, no spike chase, sane stop)
       7. Room to the target (no swing level in the way)
       8. Liquid session (London / New York for metals & FX)

   Every plan has a stop, targets and costs. The same exact rule
   is replayed over the loaded candles so the user sees how it
   actually did (after costs) — never a promise.
   ============================================================ */

export type EntryTF = '1m' | '3m' | '5m' | '15m' | '30m'
export type EntrySide = 'BUY' | 'SELL'
export type EntryMode = 'close' | 'break'

export const ENTRY_TFS: EntryTF[] = ['1m', '3m', '5m', '15m', '30m']

/** Higher timeframe used as the trend filter for each entry timeframe. */
export const HTF_FOR: Record<EntryTF, Timeframe> = { '1m': '15m', '3m': '15m', '5m': '1H', '15m': '1H', '30m': '4H' }

export const ENTRY_RULES = {
  pullbackBars: 6,
  pullbackAtr: 0.25,
  triggerClosePos: 0.65,
  triggerBody: 0.4,
  rsiBuy: [50, 72] as const,
  rsiSell: [28, 50] as const,
  atrMin: 0.6,
  atrMax: 2.5,
  spikeAtr: 1.8,
  stopBufferAtr: 0.15,
  minStopAtr: 0.6,
  maxStopAtr: 2.5,
  swingLookback: 60,
  minTiming: 3,
  maxHoldBars: 40,
  breakBufferAtr: 0.05,
  breakFillBars: 3,
}

export type CondState = 'pass' | 'fail'

export interface EntryCondition {
  key: string
  label: string
  required: boolean
  state: CondState
  value: string
  hint: string
}

export interface EntryPlan {
  side: EntrySide
  entry: number
  stop: number
  tp1: number
  tp2: number
  risk: number
  cost: number
  /** Net R at TP2 after costs, and the net loss in R if the stop is hit. */
  netWinR: number
  netLossR: number
  /** Win rate needed to break even at TP2 after costs. */
  breakevenWin: number
}

export interface EntryBacktest {
  trades: number
  wins: number
  losses: number
  timeouts: number
  winRate: number
  avgR: number
  totalR: number
  buys: number
  sells: number
  barsCovered: number
  spanLabel: string
}

export type EntryStatus =
  | 'confirmed' // just confirmed on the last closed candle
  | 'active' // confirmed 1–2 candles ago and price is still near entry
  | 'missed' // confirmed recently but price ran away / stop hit — don't chase
  | 'setup' // trend + pullback ready, waiting for the trigger candle
  | 'none' // conditions not there
  | 'nodata'

export interface EntryConfirmation {
  status: EntryStatus
  side: EntrySide | null
  tf: EntryTF
  htf: Timeframe
  conditions: EntryCondition[]
  requiredMet: number
  requiredTotal: number
  timingMet: number
  timingTotal: number
  plan: EntryPlan | null
  /** Price a closed candle must beat to trigger (setup state). */
  triggerLevel: number | null
  /** Bars since the confirming candle (active / missed). */
  barsAgo: number
  headline: string
  detail: string
  lastClosedTime: number
  nextCloseSec: number
  backtest: EntryBacktest
}

export interface EntryOptions {
  side: EntrySide | 'auto'
  targetR: number
  mode: EntryMode
  /** Round-trip cost (spread + commission + slippage) as % of price. */
  costPct: number
  /** Crypto trades 24/7; metals/FX use London–NY hours. */
  alwaysLiquid: boolean
  precision: number
}

/* ---------------- internals ---------------- */

interface Ctx {
  c: Candle[]
  tfSec: number
  e9: number[]
  e20: number[]
  e50: number[]
  r: number[]
  mh: number[]
  a: number[]
  vw: number[]
  atrMed: number[]
  /** HTF index (last CLOSED HTF bar) for each entry bar, -1 if none. */
  hIdx: number[]
  hc: Candle[]
  h20: number[]
  h50: number[]
}

function rollingMedian(v: number[], win: number): number[] {
  const out = new Array(v.length).fill(NaN)
  for (let i = 0; i < v.length; i++) {
    if (i < win) continue
    const s = v.slice(i - win, i).filter((x) => Number.isFinite(x)).sort((x, y) => x - y)
    if (s.length) out[i] = s[Math.floor(s.length / 2)]
  }
  return out
}

function buildCtx(c: Candle[], tf: EntryTF, htfCandles: Candle[]): Ctx {
  const closes = c.map((x) => x.close)
  const a = atr(c, 14)
  const tfSec = TIMEFRAME_SECONDS[tf]
  const htfSec = TIMEFRAME_SECONDS[HTF_FOR[tf]]
  const hcl = htfCandles.map((x) => x.close)
  const hIdx: number[] = new Array(c.length).fill(-1)
  let j = -1
  for (let i = 0; i < c.length; i++) {
    const closeT = c[i].time + tfSec
    while (j + 1 < htfCandles.length && htfCandles[j + 1].time + htfSec <= closeT) j++
    hIdx[i] = j
  }
  return {
    c,
    tfSec,
    e9: ema(closes, 9),
    e20: ema(closes, 20),
    e50: ema(closes, 50),
    r: rsi(closes, 14),
    mh: macd(closes).histogram,
    a,
    vw: vwap(c, 60),
    atrMed: rollingMedian(a, 100),
    hIdx,
    hc: htfCandles,
    h20: ema(hcl, 20),
    h50: ema(hcl, 50),
  }
}

const fin = (...v: number[]) => v.every((x) => Number.isFinite(x))

function htfDir(x: Ctx, i: number): EntrySide | null {
  const j = x.hIdx[i]
  if (j < 50) return null
  const cl = x.hc[j].close
  if (!fin(x.h20[j], x.h50[j])) return null
  if (x.h20[j] > x.h50[j] && cl > x.h50[j]) return 'BUY'
  if (x.h20[j] < x.h50[j] && cl < x.h50[j]) return 'SELL'
  return null
}

function liquidHour(t: number, always: boolean): boolean {
  if (always) return true
  const d = new Date(t * 1000)
  const day = d.getUTCDay()
  const h = d.getUTCHours()
  return day >= 1 && day <= 5 && h >= 7 && h < 20
}

/** Nearest fractal swing high above (BUY) / swing low below (SELL) a level. */
function nearestSwing(x: Ctx, i: number, side: EntrySide, from: number): number | null {
  const c = x.c
  let best: number | null = null
  const lo = Math.max(2, i - ENTRY_RULES.swingLookback)
  for (let k = lo; k <= i - 2; k++) {
    if (side === 'BUY') {
      const h = c[k].high
      if (h > c[k - 1].high && h > c[k - 2].high && h >= c[k + 1].high && h >= c[k + 2].high && h > from) {
        if (best == null || h < best) best = h
      }
    } else {
      const l = c[k].low
      if (l < c[k - 1].low && l < c[k - 2].low && l <= c[k + 1].low && l <= c[k + 2].low && l < from) {
        if (best == null || l > best) best = l
      }
    }
  }
  return best
}

function makePlan(x: Ctx, i: number, side: EntrySide, o: EntryOptions, entryOverride?: number): EntryPlan | null {
  const c = x.c
  const A = x.a[i]
  if (!fin(A) || A <= 0) return null
  const R = ENTRY_RULES
  const bar = c[i]
  const entry = entryOverride ?? (o.mode === 'break' ? (side === 'BUY' ? bar.high + R.breakBufferAtr * A : bar.low - R.breakBufferAtr * A) : bar.close)
  const win = c.slice(Math.max(0, i - 4), i + 1)
  let stop = side === 'BUY' ? Math.min(...win.map((b) => b.low)) - R.stopBufferAtr * A : Math.max(...win.map((b) => b.high)) + R.stopBufferAtr * A
  let risk = side === 'BUY' ? entry - stop : stop - entry
  if (risk < R.minStopAtr * A) {
    risk = R.minStopAtr * A
    stop = side === 'BUY' ? entry - risk : entry + risk
  }
  const dir = side === 'BUY' ? 1 : -1
  const cost = (entry * o.costPct) / 100
  const netWinR = (o.targetR * risk - cost) / risk
  const netLossR = -(risk + cost) / risk
  return {
    side,
    entry,
    stop,
    tp1: entry + dir * risk,
    tp2: entry + dir * o.targetR * risk,
    risk,
    cost,
    netWinR,
    netLossR,
    breakevenWin: -netLossR / (netWinR - netLossR),
  }
}

function evaluate(x: Ctx, i: number, side: EntrySide, o: EntryOptions, htfLabel: string): { conds: EntryCondition[]; plan: EntryPlan | null } {
  const R = ENTRY_RULES
  const c = x.c
  const bar = c[i]
  const prev = c[i - 1]
  const A = x.a[i]
  const f = (v: number) => v.toFixed(o.precision)
  const buy = side === 'BUY'
  const conds: EntryCondition[] = []

  // 1 · Higher timeframe
  const hd = htfDir(x, i)
  conds.push({
    key: 'htf',
    label: `${htfLabel} trend agrees`,
    required: true,
    state: hd === side ? 'pass' : 'fail',
    value: hd ? `${htfLabel}: ${hd === 'BUY' ? 'up' : 'down'} (EMA20 ${hd === 'BUY' ? '>' : '<'} EMA50)` : `${htfLabel}: no clear trend`,
    hint: buy ? `Only buy when the ${htfLabel} chart is trending up.` : `Only sell when the ${htfLabel} chart is trending down.`,
  })

  // 2 · Entry timeframe trend
  const tOk = fin(x.e9[i], x.e20[i], x.vw[i]) && (buy ? x.e9[i] > x.e20[i] && bar.close > x.vw[i] : x.e9[i] < x.e20[i] && bar.close < x.vw[i])
  conds.push({
    key: 'trend',
    label: 'Entry chart trend agrees',
    required: true,
    state: tOk ? 'pass' : 'fail',
    value: `EMA9 ${x.e9[i] > x.e20[i] ? '>' : '<'} EMA20 · price ${bar.close > x.vw[i] ? 'above' : 'below'} VWAP`,
    hint: buy ? 'Needs EMA9 above EMA20 and price above VWAP.' : 'Needs EMA9 below EMA20 and price below VWAP.',
  })

  // 3 · Pullback that held
  let touched = false
  let held = true
  for (let k = Math.max(1, i - R.pullbackBars); k < i; k++) {
    if (!fin(x.e20[k], x.e50[k], x.a[k])) continue
    if (buy) {
      if (c[k].low <= x.e20[k] + R.pullbackAtr * x.a[k]) touched = true
      if (c[k].close < x.e50[k]) held = false
    } else {
      if (c[k].high >= x.e20[k] - R.pullbackAtr * x.a[k]) touched = true
      if (c[k].close > x.e50[k]) held = false
    }
  }
  conds.push({
    key: 'pullback',
    label: 'Pullback into EMA20 held',
    required: true,
    state: touched && held ? 'pass' : 'fail',
    value: !touched ? `no dip to EMA20 in last ${R.pullbackBars} candles` : held ? 'dipped to EMA20, held EMA50' : `closed ${buy ? 'below' : 'above'} EMA50 — trend damaged`,
    hint: buy ? 'Buy the dip, not the spike: wait for price to pull back to the EMA20 area first.' : 'Sell the rally, not the drop: wait for price to bounce up to the EMA20 area first.',
  })

  // 4 · Trigger candle
  const rng = bar.high - bar.low
  const body = Math.abs(bar.close - bar.open)
  const pos = rng > 0 ? (bar.close - bar.low) / rng : 0.5
  const trig = rng > 0 && body >= R.triggerBody * rng && (buy ? bar.close > bar.open && pos >= R.triggerClosePos && bar.close > prev.high : bar.close < bar.open && pos <= 1 - R.triggerClosePos && bar.close < prev.low)
  conds.push({
    key: 'trigger',
    label: 'Trigger candle closed',
    required: true,
    state: trig ? 'pass' : 'fail',
    value: trig ? `strong close ${buy ? 'above' : 'below'} prior ${buy ? 'high' : 'low'} ${f(buy ? prev.high : prev.low)}` : `needs a strong close ${buy ? 'above' : 'below'} ${f(buy ? bar.high : bar.low)}`,
    hint: `A ${buy ? 'green' : 'red'} candle closing in its ${buy ? 'top' : 'bottom'} third and beyond the previous candle's ${buy ? 'high' : 'low'}.`,
  })

  // 5 · Momentum
  const rv = x.r[i]
  const [lo, hi] = buy ? R.rsiBuy : R.rsiSell
  const turning = fin(x.mh[i], x.mh[i - 1]) && (buy ? x.mh[i] > x.mh[i - 1] : x.mh[i] < x.mh[i - 1])
  const mOk = fin(rv) && rv >= lo && rv <= hi && turning
  conds.push({
    key: 'momentum',
    label: 'Momentum supports it',
    required: false,
    state: mOk ? 'pass' : 'fail',
    value: `RSI ${fin(rv) ? Math.round(rv) : '—'} (want ${lo}–${hi}) · MACD ${turning ? (buy ? 'rising' : 'falling') : 'not turning'}`,
    hint: buy ? (rv > hi ? 'RSI is stretched — late entry risk.' : 'Wait for RSI above 50 and MACD rising.') : rv < lo ? 'RSI is stretched — late entry risk.' : 'Wait for RSI below 50 and MACD falling.',
  })

  // 6 · Volatility & stop size
  const plan = makePlan(x, i, side, o)
  const med = x.atrMed[i]
  const ratio = fin(A, med) && med > 0 ? A / med : 1
  const spike = fin(A) && rng > R.spikeAtr * A
  const stopAtr = plan && A > 0 ? plan.risk / A : 0
  const vOk = ratio >= R.atrMin && ratio <= R.atrMax && !spike && stopAtr <= R.maxStopAtr
  conds.push({
    key: 'volatility',
    label: 'Clean volatility',
    required: false,
    state: vOk ? 'pass' : 'fail',
    value: `ATR ${ratio.toFixed(2)}× normal · candle ${fin(A) && A > 0 ? (rng / A).toFixed(1) : '—'}× ATR · stop ${stopAtr.toFixed(1)}× ATR`,
    hint: ratio < R.atrMin ? 'Market is too quiet — moves may not reach the target.' : ratio > R.atrMax ? 'Market is unusually wild — stops get hit by noise.' : spike ? 'Trigger candle is a spike — chasing it is risky.' : stopAtr > R.maxStopAtr ? 'Stop would be too wide.' : 'Normal, tradable volatility.',
  })

  // 7 · Room to target
  let rOk = true
  let rVal = 'no swing level in the way'
  if (plan) {
    const sw = nearestSwing(x, i, side, plan.entry)
    if (sw != null) {
      const roomR = Math.abs(sw - plan.entry) / plan.risk
      rOk = roomR >= o.targetR
      rVal = `swing ${buy ? 'high' : 'low'} ${f(sw)} is ${roomR.toFixed(1)}R away (target ${o.targetR}R)`
    }
  }
  conds.push({
    key: 'room',
    label: 'Room to the target',
    required: false,
    state: rOk ? 'pass' : 'fail',
    value: rVal,
    hint: rOk ? 'Path to the target is clear of recent swings.' : `A recent swing ${buy ? 'high' : 'low'} sits before the target — consider a smaller target.`,
  })

  // 8 · Session
  const sOk = liquidHour(bar.time, o.alwaysLiquid)
  conds.push({
    key: 'session',
    label: 'Liquid session',
    required: false,
    state: sOk ? 'pass' : 'fail',
    value: o.alwaysLiquid ? 'trades 24/7' : sOk ? 'London / New York hours' : 'outside London–NY (07–20 UTC, Mon–Fri)',
    hint: sOk ? 'Good liquidity — tighter spreads, cleaner moves.' : 'Thin hours: wider spreads and false breaks are more common.',
  })

  return { conds, plan }
}

function isConfirmed(conds: EntryCondition[]): boolean {
  const req = conds.filter((c) => c.required)
  const tim = conds.filter((c) => !c.required)
  return req.every((c) => c.state === 'pass') && tim.filter((c) => c.state === 'pass').length >= ENTRY_RULES.minTiming
}

/** Replay the exact rule on history: enter next candle, stop-first if both hit in one candle, after costs. */
function backtest(x: Ctx, lastClosed: number, o: EntryOptions, htfLabel: string, tf: EntryTF): EntryBacktest {
  const R = ENTRY_RULES
  const c = x.c
  let trades = 0
  let wins = 0
  let losses = 0
  let timeouts = 0
  let totalR = 0
  let buys = 0
  let sells = 0
  const start = 120
  let i = start
  while (i <= lastClosed - 1) {
    let took = false
    for (const side of ['BUY', 'SELL'] as EntrySide[]) {
      if (o.side !== 'auto' && o.side !== side) continue
      const { conds, plan } = evaluate(x, i, side, o, htfLabel)
      if (!plan || !isConfirmed(conds)) continue
      // Fill
      let fillBar = -1
      let entry = 0
      if (o.mode === 'close') {
        fillBar = i + 1
        entry = c[i + 1].open
      } else {
        for (let k = i + 1; k <= Math.min(lastClosed, i + R.breakFillBars); k++) {
          const hit = side === 'BUY' ? c[k].high >= plan.entry : c[k].low <= plan.entry
          if (hit) {
            fillBar = k
            entry = side === 'BUY' ? Math.max(c[k].open, plan.entry) : Math.min(c[k].open, plan.entry)
            break
          }
        }
      }
      if (fillBar < 0 || fillBar > lastClosed) continue
      const p = makePlan(x, i, side, o, entry)
      if (!p) continue
      const dir = side === 'BUY' ? 1 : -1
      let result: number | null = null
      let exitBar = fillBar
      for (let k = fillBar; k <= Math.min(lastClosed, fillBar + R.maxHoldBars); k++) {
        exitBar = k
        const hitStop = side === 'BUY' ? c[k].low <= p.stop : c[k].high >= p.stop
        const hitTp = side === 'BUY' ? c[k].high >= p.tp2 : c[k].low <= p.tp2
        if (hitStop) {
          result = p.netLossR
          losses++
          break
        }
        if (hitTp) {
          result = p.netWinR
          wins++
          break
        }
      }
      if (result == null) {
        // Unresolved: only count if the hold window fully elapsed (else the trade is still open).
        if (exitBar < fillBar + R.maxHoldBars) continue
        result = (dir * (c[exitBar].close - p.entry) - p.cost) / p.risk
        timeouts++
      }
      trades++
      totalR += result
      if (side === 'BUY') buys++
      else sells++
      i = exitBar + 1
      took = true
      break
    }
    if (!took) i++
  }
  const bars = Math.max(0, lastClosed - start)
  const hours = (bars * TIMEFRAME_SECONDS[tf]) / 3600
  return {
    trades,
    wins,
    losses,
    timeouts,
    winRate: trades ? wins / trades : 0,
    avgR: trades ? totalR / trades : 0,
    totalR,
    buys,
    sells,
    barsCovered: bars,
    spanLabel: hours >= 48 ? `${(hours / 24).toFixed(1)} days` : `${Math.round(hours)} hours`,
  }
}

const HTF_LABEL: Partial<Record<Timeframe, string>> = { '15m': '15m', '1H': '1H', '4H': '4H' }

export function confirmEntry(candles: Candle[], htfCandles: Candle[], tf: EntryTF, nowSec: number, o: EntryOptions): EntryConfirmation {
  const htf = HTF_FOR[tf]
  const htfLabel = HTF_LABEL[htf] ?? htf
  const tfSec = TIMEFRAME_SECONDS[tf]
  const empty: EntryBacktest = { trades: 0, wins: 0, losses: 0, timeouts: 0, winRate: 0, avgR: 0, totalR: 0, buys: 0, sells: 0, barsCovered: 0, spanLabel: '—' }
  // Index of the last CLOSED candle.
  let last = candles.length - 1
  while (last >= 0 && candles[last].time + tfSec > nowSec) last--
  const formingStart = last + 1 < candles.length ? candles[last + 1].time : last >= 0 ? candles[last].time + tfSec : nowSec
  const nextCloseSec = Math.max(0, formingStart + tfSec - nowSec)
  if (last < 130 || htfCandles.length < 60) {
    return {
      status: 'nodata', side: null, tf, htf, conditions: [], requiredMet: 0, requiredTotal: 4, timingMet: 0, timingTotal: 4, plan: null, triggerLevel: null, barsAgo: 0,
      headline: 'Loading candles…', detail: 'Needs enough closed candles on both timeframes.', lastClosedTime: 0, nextCloseSec, backtest: empty,
    }
  }
  const x = buildCtx(candles, tf, htfCandles)
  const f = (v: number) => v.toFixed(o.precision)

  // Choose the side: forced, else the higher-timeframe trend, else the side with more passes.
  let side: EntrySide
  if (o.side !== 'auto') side = o.side
  else {
    const hd = htfDir(x, last)
    if (hd) side = hd
    else {
      const b = evaluate(x, last, 'BUY', o, htfLabel).conds.filter((c) => c.state === 'pass').length
      const s = evaluate(x, last, 'SELL', o, htfLabel).conds.filter((c) => c.state === 'pass').length
      side = b >= s ? 'BUY' : 'SELL'
    }
  }

  const now = evaluate(x, last, side, o, htfLabel)
  const req = now.conds.filter((c) => c.required)
  const tim = now.conds.filter((c) => !c.required)
  const requiredMet = req.filter((c) => c.state === 'pass').length
  const timingMet = tim.filter((c) => c.state === 'pass').length
  const bt = backtest(x, last, o, htfLabel, tf)
  const word = side === 'BUY' ? 'BUY' : 'SELL'
  const base = { side, tf, htf, conditions: now.conds, requiredMet, requiredTotal: req.length, timingMet, timingTotal: tim.length, lastClosedTime: candles[last].time, nextCloseSec, backtest: bt }

  if (isConfirmed(now.conds) && now.plan) {
    return {
      ...base, status: 'confirmed', plan: now.plan, triggerLevel: null, barsAgo: 0,
      headline: `${word} entry confirmed`,
      detail: o.mode === 'close' ? `Enter near ${f(now.plan.entry)} — stop ${f(now.plan.stop)}. Valid for the next candle only; if price runs past TP1 first, skip it.` : `Place a ${side === 'BUY' ? 'buy' : 'sell'} stop at ${f(now.plan.entry)} — cancel if it does not fill within ${ENTRY_RULES.breakFillBars} candles.`,
    }
  }

  // Confirmed 1–2 candles ago?
  for (let k = 1; k <= 2; k++) {
    const i = last - k
    const ev = evaluate(x, i, side, o, htfLabel)
    if (!ev.plan || !isConfirmed(ev.conds)) continue
    const p = ev.plan
    const px = candles[candles.length - 1].close
    const dir = side === 'BUY' ? 1 : -1
    let stopped = false
    for (let j = i + 1; j < candles.length; j++) if (side === 'BUY' ? candles[j].low <= p.stop : candles[j].high >= p.stop) stopped = true
    const moved = (dir * (px - p.entry)) / p.risk
    if (!stopped && moved < 0.5 && moved > -0.6) {
      return { ...base, status: 'active', plan: p, triggerLevel: null, barsAgo: k, headline: `${word} confirmed ${k} candle${k > 1 ? 's' : ''} ago — still near entry`, detail: `Price is ${moved >= 0 ? '+' : ''}${moved.toFixed(2)}R from the ${f(p.entry)} entry. Late entries get worse R/R — only take it close to the plan.` }
    }
    return { ...base, status: 'missed', plan: p, triggerLevel: null, barsAgo: k, headline: `${word} signal ${k} candle${k > 1 ? 's' : ''} ago — missed`, detail: stopped ? 'That setup already hit its stop. Wait for the next one.' : `Price already moved ${moved.toFixed(1)}R. Don't chase — wait for the next pullback.` }
  }

  const setupReady = req.filter((c) => c.key !== 'trigger').every((c) => c.state === 'pass')
  if (setupReady) {
    const bar = candles[last]
    const lvl = side === 'BUY' ? bar.high : bar.low
    // The entry can only happen once a candle closes beyond the trigger, so plan from there.
    const buf = o.mode === 'break' ? (side === 'BUY' ? 1 : -1) * ENTRY_RULES.breakBufferAtr * x.a[last] : 0
    const plan = makePlan(x, last, side, o, lvl + buf)
    return {
      ...base, status: 'setup', plan, triggerLevel: lvl, barsAgo: 0,
      headline: `${word} setup ready — wait for the trigger`,
      detail: `Trend and pullback are in place. Confirmation needs a strong candle CLOSE ${side === 'BUY' ? 'above' : 'below'} ${f(lvl)} on the ${tf} chart.`,
    }
  }
  const missing = req.filter((c) => c.state === 'fail').map((c) => c.label.charAt(0).toLowerCase() + c.label.slice(1))
  return {
    ...base, status: 'none', plan: null, triggerLevel: null, barsAgo: 0,
    headline: `No ${word.toLowerCase()} entry — wait`,
    detail: `Missing: ${missing.join('; ')}.`,
  }
}
