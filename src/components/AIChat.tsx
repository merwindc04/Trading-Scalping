import { useState, useRef, useEffect } from 'react'
import { X, Send, Sparkles } from 'lucide-react'
import type { Analysis } from '@/lib/analyze'
import { useAppStore } from '@/store/appStore'
import { fmt } from '@/lib/format'

/* ============================================================
   AI Assistant (spec §28)

   A contextual responder that answers from the CURRENT analysis
   object — grounded in live chart data rather than free-form
   speculation. (Swap `respond` for a streaming LLM later.)
   ============================================================ */

interface Msg {
  role: 'user' | 'ai'
  text: string
}

const SUGGESTIONS = [
  'Is it a buy right now?',
  'Why is it bullish?',
  'What would invalidate this setup?',
  'Show the strongest support.',
  'Compare the 5m and 1H trend.',
  'Find similar historical patterns.',
  'Explain this pattern like I’m a beginner.',
]

function respond(q: string, a: Analysis | null): string {
  if (!a) return 'Analysis is still loading — give me a moment to read the chart.'
  const p = a.precision
  const ql = q.toLowerCase()
  const bull = a.strength.direction === 'BULLISH'
  const sg = a.signal

  // Buy / sell / entry — answer straight from the live signal.
  if (ql.includes('buy') || ql.includes('sell') || ql.includes('should i') || ql.includes('entry') || ql.includes('long') || ql.includes('short') || ql.includes('signal')) {
    if (sg.action === 'WAIT') {
      const missing = sg.checks.filter((c) => !c.passed).map((c) => c.label.toLowerCase())
      return `Right now the signal on ${a.symbolName} (${a.timeframe}) is WAIT — grade ${sg.grade}, ${sg.score}/100 conviction. ${sg.timing} What's missing: ${missing.join(', ') || 'confirmation'}. I'd stand aside until the setup firms up.`
    }
    const verb = sg.action === 'BUY' ? 'a long (buy)' : 'a short (sell)'
    return `The signal is ${sg.headline} on ${a.symbolName} (${a.timeframe}) — grade ${sg.grade}, ${sg.score}/100 conviction. It leans toward ${verb}. Entry ~${fmt(Math.min(sg.entryLow, sg.entryHigh), p)}, stop ${fmt(sg.stop, p)}, first target ${fmt(sg.targets[Math.min(1, sg.targets.length - 1)], p)} (R:R 1:${sg.riskReward}), ${sg.confidence}% confidence over ${sg.horizon}. ${sg.timing} It stays valid while price holds ${fmt(sg.stop, p)}. This is an analytical suggestion with a defined stop — not financial advice.`
  }

  if (ql.includes('invalidat')) {
    return `The ${a.forecast.primary.label.toLowerCase()} scenario stays valid while price holds ${fmt(a.forecast.primary.invalidation, p)}. A decisive close beyond it flips control to the opposite scenario and would drop forecast confidence from its current ${a.forecast.confidence}%.`
  }
  if (ql.includes('support')) {
    return `Nearest support sits at ${fmt(a.structure.nearestSupport, p)}, drawn from clustered swing lows. Below that, the key structural line is the recent swing low near ${fmt(a.structure.swingLow, p)}.`
  }
  if (ql.includes('resistance')) {
    return `Nearest resistance is ${fmt(a.structure.nearestResistance, p)} — also the breakout trigger for the active ${a.pattern.name}. Clearing it opens the projected target ladder.`
  }
  if ((ql.includes('5m') || ql.includes('1h') || ql.includes('timeframe')) && (ql.includes('compare') || ql.includes('trend'))) {
    const r5 = a.mtf.rows.find((r) => r.timeframe === '5m')
    const r1h = a.mtf.rows.find((r) => r.timeframe === '1H')
    return `5m reads ${r5?.label} (${Math.round(r5?.bullScore ?? 0)}/100) while 1H reads ${r1h?.label} (${Math.round(r1h?.bullScore ?? 0)}/100). Overall alignment across the six timeframes is ${a.mtf.alignmentPct}%. ${a.mtf.conflict ?? 'They broadly agree, which raises conviction.'}`
  }
  if (ql.includes('histor') || ql.includes('similar')) {
    return `I found ${a.historical.matchCount} historical setups resembling the current structure. Of those, ${a.historical.bullishPct}% resolved bullish, ${a.historical.neutralPct}% ranged and ${a.historical.bearishPct}% reversed lower. The closest match scored ${a.historical.topMatches[0]?.similarity.toFixed(0)}% similarity and went ${a.historical.topMatches[0]?.forwardReturnPct.toFixed(2)}% afterwards.`
  }
  if (ql.includes('pattern') || ql.includes('beginner') || ql.includes('explain')) {
    return `Think of it simply: a ${a.pattern.name} is forming and it's about ${Math.round(a.pattern.completion)}% complete. ${a.pattern.summary} If price breaks ${fmt(a.pattern.breakoutLevel, p)}, the projected zone is ${fmt(a.pattern.targetLow, p)}–${fmt(a.pattern.targetHigh, p)}; if it fails at ${fmt(a.pattern.invalidation, p)}, the idea is wrong.`
  }
  if (ql.includes('confidence')) {
    return `Confidence is ${a.forecast.confidence}% — separate from the ${a.forecast.bull}% bull probability. It reflects how much the models agree, the ${a.mtf.alignmentPct}% timeframe alignment, the historical sample size and how clean the pattern is. High probability with low confidence means "likely, but fragile".`
  }
  if (ql.includes('bull') || ql.includes('bear') || ql.includes('why')) {
    const b = a.explanation.bullets.slice(0, 3).map((x) => `• ${x.text}`).join('\n')
    return `AurumPulse currently reads ${bull ? 'bullish' : a.strength.direction === 'BEARISH' ? 'bearish' : 'neutral'} on ${a.symbolName} (strength ${a.strength.overall}/100). Key reasons:\n${b}`
  }
  return `Here's the current read on ${a.symbolName}: ${a.strength.direction} bias at ${a.strength.overall}/100 strength, active ${a.pattern.name}, and a ${a.forecast.bull}/${a.forecast.neutral}/${a.forecast.bear} bull/neutral/bear split at ${a.forecast.confidence}% confidence. Ask about support, invalidation, timeframes or historical analogues for detail.`
}

export function AIChat({ analysis }: { analysis: Analysis | null }) {
  const { chatOpen, toggleChat } = useAppStore()
  const [msgs, setMsgs] = useState<Msg[]>([
    { role: 'ai', text: 'I’m your AurumPulse assistant. I read the live chart — ask me why the bias is what it is, what invalidates it, or how today compares to history.' },
  ])
  const [input, setInput] = useState('')
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [msgs])

  function send(text: string) {
    const q = text.trim()
    if (!q) return
    setMsgs((m) => [...m, { role: 'user', text: q }])
    setInput('')
    setTimeout(() => setMsgs((m) => [...m, { role: 'ai', text: respond(q, analysis) }]), 260)
  }

  if (!chatOpen) return null

  return (
    <div className="glass fixed bottom-0 right-0 top-14 z-40 flex w-full flex-col border-l border-white/10 sm:w-[380px]">
      <div className="flex items-center justify-between border-b border-white/[0.06] px-3.5 py-2.5">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-gold-200/25 to-gold-500/10">
            <Sparkles size={14} className="text-gold-200" />
          </span>
          <div>
            <div className="text-[12px] font-semibold text-ink-100">AI Assistant</div>
            <div className="text-[9px] text-ink-500">Grounded in live chart data</div>
          </div>
        </div>
        <button onClick={toggleChat} className="btn !px-2">
          <X size={14} />
        </button>
      </div>

      <div className="flex-1 space-y-3 overflow-auto scrollbar-thin px-3.5 py-3">
        {msgs.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] whitespace-pre-line rounded-2xl px-3 py-2 text-[11.5px] leading-relaxed ${
                m.role === 'user' ? 'rounded-br-sm bg-gold-500/[0.14] text-gold-50 text-ink-100' : 'rounded-bl-sm bg-base-800 text-ink-300'
              }`}
            >
              {m.text}
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <div className="border-t border-white/[0.06] p-2.5">
        <div className="mb-2 flex flex-wrap gap-1">
          {SUGGESTIONS.map((s) => (
            <button key={s} onClick={() => send(s)} className="rounded-full border border-white/[0.07] bg-base-800 px-2 py-1 text-[9.5px] text-ink-400 hover:border-gold-500/30 hover:text-gold-200">
              {s}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5 rounded-xl border border-white/[0.07] bg-base-800 px-2 py-1">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && send(input)}
            placeholder="Ask about the current setup…"
            className="flex-1 bg-transparent px-1 py-1.5 text-[12px] text-ink-100 placeholder:text-ink-600 focus:outline-none"
          />
          <button onClick={() => send(input)} className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-b from-gold-200 to-gold-400 text-base-950">
            <Send size={13} />
          </button>
        </div>
      </div>
    </div>
  )
}
