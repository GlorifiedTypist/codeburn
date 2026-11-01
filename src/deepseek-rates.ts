// Official DeepSeek API peak rates. Off-peak is exactly half of every figure
// (src/peak-hours.ts). Source, fetched 2026-11-01:
// https://api-docs.deepseek.com/quick_start/pricing
//
// deepseek-v4-pro is DeepSeek-V4-Pro-0813. deepseek-flash is
// DeepSeek-V4.1-Flash-1017. Legacy ids deepseek-v4-flash and
// deepseek-v4-flash-vision-exp are served by V4.1-Flash and billed here.
//
// deepseek-chat and deepseek-reasoner are no longer on that page. While the
// pricing catalog still has a row for them, that row wins (the last published
// rate for the name). DEEPSEEK_UNLISTED_FALLBACK is what getModelCosts uses
// when the row is gone, so old transcripts price as Flash instead of $0.

export type DeepSeekTokenRates = {
  /// USD per 1,000,000 tokens.
  inputCacheHit: number
  inputCacheMiss: number
  output: number
}

export const DEEPSEEK_OFF_PEAK_FACTOR = 0.5

export const DEEPSEEK_PEAK_USD_PER_MILLION: Readonly<Record<string, DeepSeekTokenRates>> = {
  'deepseek-v4-pro': { inputCacheHit: 0.044, inputCacheMiss: 1.32, output: 3.96 },
  'deepseek-flash': { inputCacheHit: 0.006, inputCacheMiss: 0.3, output: 1.2 },
}

/// Ids billed at the Flash peak rate. The versioned product name is
/// DeepSeek-V4.1-Flash; the legacy v4-flash names are the same bill.
export const DEEPSEEK_FLASH_RATE_IDS: readonly string[] = [
  'deepseek-flash',
  'deepseek/deepseek-flash',
  'deepseek-v4-flash',
  'deepseek/deepseek-v4-flash',
  'deepseek-v4-flash-vision-exp',
  'deepseek/deepseek-v4-flash-vision-exp',
  'deepseek-v4.1-flash',
]

export const DEEPSEEK_PRO_RATE_IDS: readonly string[] = [
  'deepseek-v4-pro',
  'deepseek/deepseek-v4-pro',
  'deepseek-v4-pro-0813',
  'deepseek/deepseek-v4-pro-0813',
]

/// Retired API names. Value is the model whose peak rates stand in when the
/// catalog has no row of their own. Not an alias: a catalog row still wins.
export const DEEPSEEK_UNLISTED_FALLBACK: Readonly<Record<string, string>> = {
  'deepseek-chat': 'deepseek-flash',
  'deepseek-reasoner': 'deepseek-flash',
}

export function offPeakRates(peak: DeepSeekTokenRates): DeepSeekTokenRates {
  const factor = DEEPSEEK_OFF_PEAK_FACTOR
  return {
    inputCacheHit: peak.inputCacheHit * factor,
    inputCacheMiss: peak.inputCacheMiss * factor,
    output: peak.output * factor,
  }
}

/// Leaf id of a possibly prefixed model name, lowercased.
export function deepSeekUnlistedFallbackId(model: string): string | null {
  const leaf = model.toLowerCase().split('/').pop() ?? ''
  return DEEPSEEK_UNLISTED_FALLBACK[leaf] ?? null
}

/// [input, output, cacheWrite, cacheRead] USD/token at the peak list rate.
/// Cache write is 0: DeepSeek bills cache-miss input and cache-hit input,
/// not a separate write surcharge. A null write slot would invent 1.25x.
export function deepSeekOfficialPeakTuples(): Record<string, [number, number, number, number]> {
  const out: Record<string, [number, number, number, number]> = {}
  const put = (id: string, rates: DeepSeekTokenRates) => {
    out[id] = [rates.inputCacheMiss / 1e6, rates.output / 1e6, 0, rates.inputCacheHit / 1e6]
  }
  for (const id of DEEPSEEK_PRO_RATE_IDS) put(id, DEEPSEEK_PEAK_USD_PER_MILLION['deepseek-v4-pro']!)
  for (const id of DEEPSEEK_FLASH_RATE_IDS) put(id, DEEPSEEK_PEAK_USD_PER_MILLION['deepseek-flash']!)
  return out
}
