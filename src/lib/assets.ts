import type { Asset } from '@/types/market'

/* ============================================================
   Asset registry. XAUUSD is the primary MVP focus; the rest
   power the AI Scanner & Watchlist and prove the architecture
   is multi-asset from day one.
   ============================================================ */

export const ASSETS: Record<string, Asset> = {
  // Abu Dhabi / UAE local gold rate — live spot converted to AED per gram (24K).
  XAUAED: { symbol: 'XAUAED', name: 'Gold · Abu Dhabi', assetClass: 'Metals', seedPrice: 518, precision: 2, vol: 0.11, currency: 'AED', unit: 'AED/g' },
  XAUUSD: { symbol: 'XAUUSD', name: 'Gold · Spot', assetClass: 'Metals', seedPrice: 3384.5, precision: 2, vol: 0.11, currency: 'USD', unit: 'USD/oz' },
  XAGUSD: { symbol: 'XAGUSD', name: 'Silver', assetClass: 'Metals', seedPrice: 38.42, precision: 3, vol: 0.2, currency: 'USD' },
  BTCUSD: { symbol: 'BTCUSD', name: 'Bitcoin', assetClass: 'Crypto', seedPrice: 96850, precision: 1, vol: 0.4, currency: 'USD' },
  ETHUSD: { symbol: 'ETHUSD', name: 'Ethereum', assetClass: 'Crypto', seedPrice: 3410, precision: 2, vol: 0.46, currency: 'USD' },
  EURUSD: { symbol: 'EURUSD', name: 'Euro / Dollar', assetClass: 'Forex', seedPrice: 1.0842, precision: 4, vol: 0.07, currency: 'USD' },
  GBPUSD: { symbol: 'GBPUSD', name: 'Pound / Dollar', assetClass: 'Forex', seedPrice: 1.2712, precision: 4, vol: 0.08, currency: 'USD' },
  USDJPY: { symbol: 'USDJPY', name: 'Dollar / Yen', assetClass: 'Forex', seedPrice: 156.34, precision: 3, vol: 0.09, currency: 'JPY' },
  NAS100: { symbol: 'NAS100', name: 'Nasdaq 100', assetClass: 'Indices', seedPrice: 21380, precision: 1, vol: 0.16, currency: 'USD' },
  SPX500: { symbol: 'SPX500', name: 'S&P 500', assetClass: 'Indices', seedPrice: 5642, precision: 1, vol: 0.13, currency: 'USD' },
}

export const PRIMARY_ASSET = 'XAUAED'

export const WATCHLIST_DEFAULT = ['XAUAED', 'XAUUSD', 'XAGUSD', 'BTCUSD', 'NAS100', 'EURUSD']

export const SCANNER_ASSETS = ['XAUUSD', 'XAGUSD', 'BTCUSD', 'EURUSD', 'GBPUSD', 'USDJPY', 'NAS100', 'SPX500']

export function fmtPrice(v: number, precision: number): string {
  return v.toLocaleString('en-US', { minimumFractionDigits: precision, maximumFractionDigits: precision })
}
