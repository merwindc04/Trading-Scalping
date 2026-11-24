import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Play, Pause, SkipBack, SkipForward, X, Volume2, RotateCcw } from 'lucide-react'
import type { Analysis } from '@/lib/analyze'
import { buildNarration, NARRATION_TITLES, type NarrationKey } from '@/lib/narration'

/* ============================================================
   Voice narrator — reads the chart, pattern, signals and KPI
   panels aloud with the browser's built-in speech (no account,
   no data leaves the device). One utterance per sentence so the
   caption can follow along and the user can skip back/forward.
   The script is a snapshot taken when playback starts.
   ============================================================ */

type Scope = 'all' | NarrationKey
interface Line {
  section: NarrationKey
  text: string
}

const PREFS_KEY = 'aurumpulse-voice'
const RATES = [0.85, 1, 1.15, 1.3]

function readPrefs(): { rate: number; voiceURI: string | null } {
  try {
    const p = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}')
    return { rate: RATES.includes(p.rate) ? p.rate : 1, voiceURI: typeof p.voiceURI === 'string' ? p.voiceURI : null }
  } catch {
    return { rate: 1, voiceURI: null }
  }
}

const synth = typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null

/** English voices, the more natural-sounding ones first. */
function useVoices() {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>(() => synth?.getVoices() ?? [])
  useEffect(() => {
    if (!synth) return
    const load = () => setVoices(synth.getVoices())
    load()
    synth.addEventListener('voiceschanged', load)
    return () => synth.removeEventListener('voiceschanged', load)
  }, [])
  return useMemo(() => {
    const en = voices.filter((v) => v.lang.toLowerCase().startsWith('en'))
    const score = (v: SpeechSynthesisVoice) => (/natural|neural|online/i.test(v.name) ? 0 : /google/i.test(v.name) ? 1 : 2)
    return [...en].sort((a, b) => score(a) - score(b) || a.name.localeCompare(b.name))
  }, [voices])
}

export function VoiceNarrator({ analysis, price, onClose }: { analysis: Analysis; price: number | null; onClose: () => void }) {
  const voices = useVoices()
  const [prefs, setPrefs] = useState(readPrefs)
  const [scope, setScope] = useState<Scope>('all')
  const [lines, setLines] = useState<Line[]>([])
  const [idx, setIdx] = useState(0)
  const [playing, setPlaying] = useState(false)
  const run = useRef(0) // bumps on every new utterance so stale 'end' events are ignored
  const latest = useRef({ analysis, price })
  latest.current = { analysis, price }

  useEffect(() => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
    } catch {
      /* not remembered — fine */
    }
  }, [prefs])

  const voice = voices.find((v) => v.voiceURI === prefs.voiceURI) ?? voices[0] ?? null
  // Read through a ref so a speed/voice change applies from the next sentence.
  const speech = useRef({ rate: prefs.rate, voice })
  speech.current = { rate: prefs.rate, voice }

  /** Fresh script from the live analysis, limited to the chosen part. */
  const buildLines = useCallback((sc: Scope): Line[] => {
    const { analysis: a, price: px } = latest.current
    return buildNarration(a, px ?? a.price)
      .filter((s) => sc === 'all' || s.key === sc)
      .flatMap((s) => s.sentences.map((text) => ({ section: s.key, text })))
  }, [])

  const stopSpeech = () => {
    run.current++
    synth?.cancel()
  }

  const speakFrom = useCallback(
    (list: Line[], i: number) => {
      stopSpeech()
      if (i >= list.length) {
        setPlaying(false)
        setIdx(Math.max(0, list.length - 1))
        return
      }
      setIdx(i)
      setPlaying(true)
      if (!synth) return // captions only
      const id = run.current
      const { rate, voice: v } = speech.current
      const u = new SpeechSynthesisUtterance(list[i].text)
      u.rate = rate
      u.lang = v?.lang ?? 'en-GB'
      if (v) u.voice = v
      u.onend = () => {
        if (run.current === id) speakFrom(list, i + 1)
      }
      u.onerror = (e) => {
        if (run.current === id && e.error !== 'interrupted' && e.error !== 'canceled') setPlaying(false)
      }
      synth.speak(u)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  // Start reading as soon as the narrator opens (the click that opened it counts as the user gesture).
  useEffect(() => {
    const l = buildLines('all')
    setLines(l)
    speakFrom(l, 0)
    return () => stopSpeech()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const choose = (sc: Scope) => {
    setScope(sc)
    const l = buildLines(sc)
    setLines(l)
    speakFrom(l, 0)
  }

  const togglePlay = () => {
    if (playing) {
      stopSpeech()
      setPlaying(false)
    } else {
      // Restart with fresh numbers when the last run finished; otherwise resume at this sentence.
      const atEnd = idx >= lines.length - 1
      const l = atEnd || !lines.length ? buildLines(scope) : lines
      if (atEnd) setLines(l)
      speakFrom(l, atEnd ? 0 : idx)
    }
  }

  const step = (delta: number) => {
    const i = Math.min(Math.max(0, idx + delta), Math.max(0, lines.length - 1))
    if (playing) speakFrom(lines, i)
    else setIdx(i)
  }

  // Captions-only mode (no speech engine): advance on a timer while "playing".
  useEffect(() => {
    if (synth || !playing || !lines[idx]) return
    const ms = Math.max(2500, (lines[idx].text.length / 14) * 1000) / prefs.rate
    const t = window.setTimeout(() => (idx + 1 < lines.length ? setIdx(idx + 1) : setPlaying(false)), ms)
    return () => window.clearTimeout(t)
  }, [playing, idx, lines, prefs.rate])

  const line = lines[idx]
  const progress = lines.length ? ((idx + (playing ? 0.5 : 1)) / lines.length) * 100 : 0

  return (
    <div
      className="absolute bottom-3 left-1/2 z-30 w-[min(560px,calc(100%-16px))] -translate-x-1/2 rounded-xl border border-gold-500/20 text-[11px] shadow-[0_18px_50px_-20px_rgba(0,0,0,0.9)]"
      style={{ background: 'rgba(14,16,21,0.94)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)' }}
      role="region"
      aria-label="Voice explanation"
    >
      {/* Top row: what to read + close */}
      <div className="flex items-center gap-1.5 border-b border-white/[0.06] px-2.5 py-1.5">
        <Volume2 size={13} className={`shrink-0 text-gold-300 ${playing ? 'animate-pulse' : ''}`} />
        <div className="flex flex-1 items-center gap-0.5 overflow-x-auto scrollbar-thin" role="group" aria-label="What to explain">
          {(['all', 'chart', 'pattern', 'signals', 'kpis'] as Scope[]).map((sc) => (
            <button
              key={sc}
              type="button"
              onClick={() => choose(sc)}
              aria-pressed={scope === sc}
              className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold transition-colors ${scope === sc ? 'bg-white/[0.08] text-gold-200' : 'text-ink-500 hover:text-ink-300'}`}
            >
              {sc === 'all' ? 'Everything' : NARRATION_TITLES[sc]}
            </button>
          ))}
        </div>
        <button type="button" onClick={onClose} className="rounded p-1 text-ink-500 hover:text-ink-200" aria-label="Close voice explanation" title="Close">
          <X size={13} />
        </button>
      </div>

      {/* Caption */}
      <div className="px-3 pt-2" aria-live="polite">
        <div className="mb-0.5 flex items-center justify-between text-[9px] font-semibold uppercase tracking-wider text-ink-500">
          <span>{line ? NARRATION_TITLES[line.section] : ''}</span>
          <span className="nums">
            {lines.length ? idx + 1 : 0} / {lines.length}
          </span>
        </div>
        <p className="min-h-[2.8em] text-[12px] leading-snug text-ink-100">{line?.text ?? 'Preparing…'}</p>
        <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-base-700">
          <div className="h-full rounded-full bg-gold-400 transition-[width] duration-500" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-1.5 px-2.5 py-2">
        <button type="button" onClick={() => step(-1)} className="rounded-md p-1.5 text-ink-300 hover:bg-white/[0.06]" aria-label="Previous sentence" title="Previous">
          <SkipBack size={14} />
        </button>
        <button
          type="button"
          onClick={togglePlay}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-b from-gold-200 to-gold-400 text-base-950"
          aria-label={playing ? 'Pause' : idx >= lines.length - 1 && lines.length ? 'Play again with fresh numbers' : 'Play'}
          title={playing ? 'Pause' : 'Play'}
        >
          {playing ? <Pause size={14} /> : idx >= lines.length - 1 && lines.length ? <RotateCcw size={14} /> : <Play size={14} className="ml-0.5" />}
        </button>
        <button type="button" onClick={() => step(1)} className="rounded-md p-1.5 text-ink-300 hover:bg-white/[0.06]" aria-label="Next sentence" title="Next">
          <SkipForward size={14} />
        </button>

        <div className="ml-auto flex items-center gap-1.5">
          <label className="flex items-center gap-1 text-[10px] text-ink-500">
            Speed
            <select
              value={prefs.rate}
              onChange={(e) => setPrefs((p) => ({ ...p, rate: Number(e.target.value) }))}
              className="rounded border border-white/[0.08] bg-base-800 px-1 py-0.5 text-[10px] text-ink-200"
            >
              {RATES.map((r) => (
                <option key={r} value={r}>
                  {r}×
                </option>
              ))}
            </select>
          </label>
          {voices.length > 1 && (
            <label className="hidden items-center gap-1 text-[10px] text-ink-500 sm:flex">
              Voice
              <select
                value={voice?.voiceURI ?? ''}
                onChange={(e) => setPrefs((p) => ({ ...p, voiceURI: e.target.value }))}
                className="max-w-[150px] truncate rounded border border-white/[0.08] bg-base-800 px-1 py-0.5 text-[10px] text-ink-200"
              >
                {voices.map((v) => (
                  <option key={v.voiceURI} value={v.voiceURI}>
                    {v.name.replace(/^(Microsoft|Google)\s+/, '').replace(/\s*-\s*English.*$/, '')} ({v.lang})
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      </div>
      {!synth && <p className="px-3 pb-2 text-[10px] text-[var(--color-neutral-400)]">This browser has no speech voice, so the explanation is shown as captions.</p>}
    </div>
  )
}
