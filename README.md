# AurumPulse AI

**See the Structure. Understand the Momentum. Visualize What Comes Next.**
_AI-Powered Market Structure & Probability Forecasting._

AurumPulse AI reads live and historical market structure, detects technical
patterns, measures bullish/bearish strength, compares similar historical setups,
and **visually projects the highest-probability next market movements directly on
the chart**. It never claims certainty — every forecast is framed as a
probability with an explicit invalidation level and a separate confidence score.

The MVP focuses on **Gold / XAUUSD**, but the architecture is modular and
multi-asset from day one (Silver, Crypto, Forex, Indices already power the
Scanner and Watchlist).

---

## Quick start

```bash
npm install
npm run dev      # http://localhost:5180
```

```bash
npm run build    # type-check + production bundle → dist/
npm run preview  # serve the production build
```

Requires Node 18+ (built and verified on Node 24).

---

## The signature experience — READ → ANALYZE → COMPARE → PROJECT → EXPLAIN

The chart transitions seamlessly from **real, solid candles** into **translucent
projected scenarios**:

- **Projected Pattern™** — three future paths (Bull / Base / Bear), each with
  probability, target ladder, invalidation, projected duration, expected
  volatility and R:R. Toggle Bull Case / Base Case / Bear Case / Show All.
- **Ghost Candles** — semi-transparent future candles that fade with distance,
  wrapped in a widening **uncertainty envelope** (narrow = confident, wide = not).
- **Market Strength Score** — a weighted blend of nine components (Trend,
  Momentum, Structure, Pattern, Volume, MTF Alignment, Volatility Quality,
  Breakout Confirmation, Historical Similarity).
- **Multi-Timeframe Matrix** — six timeframes at a glance with an alignment %,
  and it explicitly surfaces conflicts (e.g. _"5m is bearish but 4H is bullish"_).
- **Historical Analogues** — finds similar past setups and shows how they resolved.
- **Why This Forecast?** — plain-language reasoning a beginner can follow, always
  ending with what would invalidate the thesis.
- **AI Assistant** — answers questions grounded in the current chart data.

---

## Architecture

Interface-driven so no vendor or model is load-bearing (spec §39).

```
src/
├─ types/market.ts                 # OHLCV, Timeframe, Direction, GhostCandle…
├─ lib/
│  ├─ assets.ts                    # multi-asset registry (XAUUSD primary)
│  ├─ providers/                   # DATA LAYER (swap this to go live)
│  │  ├─ MarketDataProvider.ts     #   ← the one interface a live feed implements
│  │  ├─ DemoMarketDataProvider.ts #   deterministic demo feed + simulated tape
│  │  └─ demoGenerator.ts          #   realistic seeded OHLCV (regimes, vol clustering)
│  ├─ engines/                     # ANALYSIS ENSEMBLE (spec §33)
│  │  ├─ indicators.ts             #   EMA/RSI/MACD/ATR/ADX/BB/VWAP/StochRSI/ROC + interpretation
│  │  ├─ structure.ts              #   swings, HH/HL/LH/LL, BOS/CHoCH, S/R, trend
│  │  ├─ patterns.ts               #   trend-aware pattern detection framework
│  │  ├─ strength.ts               #   9-component weighted Market Strength
│  │  ├─ historical.ts             #   historical analogue search + outcomes
│  │  ├─ forecast.ts               #   Projected Pattern™: scenarios, ghost candles, confidence
│  │  └─ explain.ts                #   plain-language explanation
│  └─ analyze.ts                   # orchestrator → single Analysis object
├─ hooks/useAnalysis.ts            # runs the pipeline + live streaming
├─ store/appStore.ts              # zustand: asset / timeframe / style / overlays
├─ components/                     # chart, panels, layout, AI chat, UI primitives
└─ pages/                          # Dashboard, Scanner, Forecast, Historical, …
```

**Confidence ≠ probability** (spec §35). Probability comes from the ensemble bull
score; confidence is computed separately from model agreement, timeframe
alignment, historical sample size, pattern clarity and volatility.

### Live data (on by default for Gold)

`LiveMarketDataProvider` streams **real market data** with no API key and no
proxy, via Binance's public market-data host (`data-api.binance.vision`):

- **XAUUSD → PAXGUSDT** — PAX Gold, redeemable 1:1 for a troy ounce of physical
  gold, so it tracks spot gold in real time (REST history + live WebSocket tape).
- **BTCUSD / ETHUSD** — live too.
- Anything unmapped (silver, forex, indices) — or any symbol whose live fetch is
  blocked by the network/region — **falls back to the demo feed automatically**,
  so the app never breaks. The **LIVE / DEMO** badge always reflects the truth
  per symbol.

Everything above the data layer is feed-agnostic. For true spot XAU/USD, forex
and index coverage, drop a keyed provider (Twelve Data, Polygon, OANDA…) behind
the same `MarketDataProvider` interface — no UI or engine changes. Demo data is
always clearly labelled and never presented as a real live price.

---

## Share / deploy

The app is a pure client-side SPA (it calls Binance's public API directly — no
backend of its own), so it can be shared as static files that run on any desktop
or mobile browser, with **live data intact**.

**One self-contained file** (easiest to share):

```bash
npm run build:single      # → dist-single/index.html  (one ~460 KB file, everything inlined)
```

That single HTML file has React, the charts, all engines, styles and favicon
inlined — **zero external references**. You can:

- **Open it directly** — double-click on any desktop (works offline for the UI;
  pulls live gold when online).
- **Host it for a public URL** (works on every device):
  - **Netlify Drop** — drag the file onto <https://app.netlify.com/drop> → instant URL.
  - **Cloudflare Pages / GitHub Pages / Vercel** — upload the file (or the `dist/` folder).
  - **Any web server / S3 bucket** — copy the file in; no config needed.
- **Test on your phone right now** — while `npm run dev` is running, open
  `http://<your-computer-LAN-IP>:5180` on a phone on the same Wi-Fi.

**Multi-file build** (standard hosting of a folder):

```bash
npm run build             # → dist/  (index.html + hashed assets)
```

Live data needs an internet connection on the viewer's device; if a viewer's
network/region blocks Binance, the app falls back to demo data automatically and
labels it clearly.

## Tech

Vite · React 18 · TypeScript · Tailwind CSS v4 · lightweight-charts · zustand.

---

## Roadmap (phased)

| Phase | Scope | Status |
|------|-------|--------|
| 1 | Premium dashboard, chart, Projected Pattern, strength, MTF | **Live** |
| 2 | Real indicator calculations & structural analysis | **Live** |
| 3 | Chart-pattern recognition | **Live (framework)** |
| 4 | Historical analogue search | **Live** |
| 5 | Probabilistic forecast models | **Live (ensemble)** |
| 6 | Forecast Time Machine + model-performance analytics | Planned |
| 7 | Live market-data APIs | **Live** (Gold + BTC/ETH via Binance) |
| 8 | Alerts / accounts / journal | Alerts + roadmap UIs in place |
| 9 | Multi-asset expansion (Silver, Crypto, Forex, Indices, Stocks) | Architecture ready |

Machine-learning principles (spec §34) are baked into the design intent:
train/test chronologically, walk-forward validation, no shuffling of future and
past, evaluate per market / timeframe / regime.

---

## Disclaimer

AurumPulse AI provides analytical and educational market insights. Forecasts are
probabilistic and are **not** guarantees of future market performance or
personalised financial advice.
