// Peak-hours billing windows for vendors that price peak vs off-peak usage.
//
// Sources (pricing rechecked 2026-11-01; holiday list in
// src/data/chinese-public-holidays.ts):
// - DeepSeek API docs (api-docs.deepseek.com/quick_start/pricing): off-peak
//   rates are half (0.5x) of the peak (list) rates. Peak hours are 01:00-04:00
//   and 06:00-10:00 UTC, Monday-Friday, excluding Chinese public holidays.
//   Everything else (nights, weekends, CN holidays) is off-peak.
// - Z.ai GLM Coding Plan (docs.z.ai/devpack/overview): off-peak usage is
//   charged at 50% of the standard credit rate. Peak hours are Monday-Friday
//   14:00-18:00 Singapore time (SGT = UTC+8). The discount applies to plan
//   CREDITS, not to USD pricing.
//
// Design: this module classifies a call's timestamp into peak/off-peak/unknown
// and, for DeepSeek USD bills, exposes the multiplier the pricer applies.
// deepSeekUsdBillFactor is 0.5 off-peak and 1 at peak. It is 1 when the
// timestamp is missing or unparseable: off-peak is a discount, applied only
// when the call's own timestamp proves the window.
// The multiplier follows the model DeepSeek billed, not the coding tool that
// logged the call. OpenCode, Claude-compatible transcripts, dsh, and any
// other wrapper use this schedule for a DeepSeek API model id (bare, or
// `deepseek/…`). A gateway keeps its own uniform price: OpenRouter,
// zerostack, vercel-gateway, a Bedrock/Vertex/OpenRouter route, or any model
// id whose first namespace is not `deepseek`.
// The models report still splits stored costUSD by window for the first-party
// set below. For DeepSeek that stored cost is already the time-of-day bill,
// and the legs still add back up to the Cost column.
//
// That split set must stay disjoint from REPORTED_COST_PROVIDERS: those
// providers (or calls with `costFromBilling`) may already carry a discount in
// a reported cost. A provider joining that set can never appear there.

import { CHINESE_PUBLIC_HOLIDAYS as CHINESE_PUBLIC_HOLIDAY_DATES } from './data/chinese-public-holidays.js'
import { DEEPSEEK_OFF_PEAK_FACTOR } from './deepseek-rates.js'
import { registeredRouteIds, resolveCanonicalModelId } from './models.js'

/// How a route's vendor treats peak-hour usage.
export type PeakBillingKind =
  /// DeepSeek API: 0.5x USD bill during off-peak hours.
  | 'deepseek-usd'
  /// Z.ai coding plan: 0.5x plan-credit rate off-peak; USD pricing untouched.
  | 'zai-credits'

export type PeakClass = 'peak' | 'off-peak' | 'unknown'

// Observed Chinese public holidays. The list, its sources, and how to refresh
// it live in src/data/chinese-public-holidays.ts. A year that is not in the
// list treats weekdays as peak (never applies an unsourced discount).
const CHINESE_PUBLIC_HOLIDAYS: ReadonlySet<string> = new Set(CHINESE_PUBLIC_HOLIDAY_DATES)

// Peak-window edges, minutes from UTC midnight, [start, end).
const DEEPSEEK_PEAK_EDGES_MINUTES = [60, 240, 360, 600] as const

/// Years the DeepSeek holiday calendar above covers. A test pins the current
/// year to this set so the calendar cannot silently go stale.
export function deepSeekHolidayCoverageYears(): ReadonlySet<number> {
  const years = new Set<number>()
  for (const key of CHINESE_PUBLIC_HOLIDAYS) years.add(Number(key.slice(0, 4)))
  return years
}

// Z.ai promotional all-day off-peak windows as [start, end] SGT calendar
// dates, both inclusive (docs.z.ai announcements). Unlike the DeepSeek
// holiday calendar these are temporary: when a range passes, it simply stops
// matching — nothing extrapolates it, and no new entry is owed.
// 2026-09-25..2026-10-07: Mid-Autumn + National Day promotion; every hour of
// the plan is off-peak.
const ZAI_OFF_PEAK_PROMOTIONS: ReadonlyArray<readonly [string, string]> = [
  ['2026-09-25', '2026-10-07'],
]

function utcDateKey(date: Date): string {
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function isWeekdayUtc(date: Date): boolean {
  const day = date.getUTCDay()
  return day >= 1 && day <= 5
}

/// True when the instant falls in a DeepSeek peak window: Mon-Fri 01:00-04:00
/// or 06:00-10:00 UTC, excluding Chinese public holidays (full days off-peak).
export function isDeepSeekPeak(instant: Date): boolean {
  if (!isWeekdayUtc(instant)) return false
  if (CHINESE_PUBLIC_HOLIDAYS.has(utcDateKey(instant))) return false
  const minutes = instant.getUTCHours() * 60 + instant.getUTCMinutes()
  return (minutes >= 60 && minutes < 240) || (minutes >= 360 && minutes < 600)
}

export type DeepSeekPhase = 'peak' | 'off-peak'

export function deepSeekPhase(instant: Date): DeepSeekPhase {
  return isDeepSeekPeak(instant) ? 'peak' : 'off-peak'
}

export function isChinesePublicHolidayUtc(instant: Date): boolean {
  return CHINESE_PUBLIC_HOLIDAYS.has(utcDateKey(instant))
}

/// The next UTC instant at which deepSeekPhase flips. Edges are 01:00, 04:00,
/// 06:00 and 10:00, and only on a non-holiday weekday, so those are the only
/// candidates. The returned instant is strictly after `instant`.
export function nextDeepSeekPhaseChange(instant: Date): Date {
  const start = instant.getTime()
  const phase = isDeepSeekPeak(instant)
  const year = instant.getUTCFullYear()
  const month = instant.getUTCMonth()
  const day = instant.getUTCDate()
  for (let offset = 0; offset < 21; offset++) {
    const dayStart = Date.UTC(year, month, day + offset)
    for (const minutes of DEEPSEEK_PEAK_EDGES_MINUTES) {
      const time = dayStart + minutes * 60_000
      if (time <= start) continue
      if (isDeepSeekPeak(new Date(time)) !== phase) return new Date(time)
    }
  }
  return new Date(Date.UTC(year, month, day + 21))
}

/// True when the instant falls in a Z.ai peak window: Mon-Fri 14:00-18:00
/// Singapore time. SGT is UTC+8 with no DST, so 14:00-18:00 SGT is exactly
/// 06:00-10:00 UTC every day — no timezone database needed. Promotional
/// all-day off-peak windows override the weekly schedule.
export function isZaiPeak(instant: Date): boolean {
  // The promotion runs on Z.ai's own calendar days (SGT), so read the date
  // key from UTC+8, not UTC.
  const sgtKey = utcDateKey(new Date(instant.getTime() + 8 * 3_600_000))
  if (ZAI_OFF_PEAK_PROMOTIONS.some(([start, end]) => sgtKey >= start && sgtKey <= end)) return false
  if (!isWeekdayUtc(instant)) return false
  const minutes = instant.getUTCHours() * 60 + instant.getUTCMinutes()
  return minutes >= 360 && minutes < 600
}

/// Providers whose calls bill directly with the vendor and therefore carry
/// its peak/off-peak regime. Everything else — gateways, resellers, tools
/// that merely serve the same models — must stay out: their price is uniform
/// across the day (or already discounted in a reported cost), so splitting
/// their usage would misattribute a discount they never had. Keep disjoint
/// from REPORTED_COST_PROVIDERS in src/parser.ts.
const FIRST_PARTY_PEAK_PROVIDERS: ReadonlyMap<string, PeakBillingKind> = new Map([
  // DeepSeek Harness: DeepSeek's own CLI, billed on the DeepSeek API account.
  ['dsh', 'deepseek-usd'],
  // ZCode: the GLM Coding Plan client, billed in Z.ai plan credits.
  ['zcode', 'zai-credits'],
])

function canonicalLeaf(model: string): string {
  return resolveCanonicalModelId(model).toLowerCase()
}

const DEEPSEEK_PEAK_MODEL_PATTERNS = [
  /^deepseek-chat/,
  /^deepseek-reasoner/,
  /^deepseek-v4/,
  /^deepseek-flash/,
  /^deepseek-v3/,
  /^deepseek-r1/,
  /^deepseek-coder/,
]

const ZAI_PEAK_MODEL_PATTERNS = [
  /^glm-/,
  /^z-ai\//,
  /^zai\./,
  /^zhipu\//,
]

/// Which peak-billing regime a call falls under, if any: the provider must
/// bill first-party with the vendor, and the model must be one of the
/// vendor's. Gateway prefixes (cliproxy/, orcarouter/, ...) resolve through
/// the canonical id first, but a gateway provider still fails the gate.
export function peakBillingKind(provider: string, model: string): PeakBillingKind | null {
  const kind = FIRST_PARTY_PEAK_PROVIDERS.get(provider)
  if (!kind) return null
  if (!model || typeof model !== 'string') return null
  const leaf = canonicalLeaf(model)
  const patterns = kind === 'deepseek-usd' ? DEEPSEEK_PEAK_MODEL_PATTERNS : ZAI_PEAK_MODEL_PATTERNS
  return patterns.some(pattern => pattern.test(leaf)) ? kind : null
}

function parseInstant(timestamp: string | undefined): Date | null {
  if (!timestamp || typeof timestamp !== 'string') return null
  const time = Date.parse(timestamp)
  if (!Number.isFinite(time)) return null
  return new Date(time)
}

/// Classify one call's timestamp for its route's peak regime.
/// 'unknown' when the route has no peak pricing or the timestamp is
/// missing/invalid — never guessed.
export function classifyPeak(provider: string, model: string, timestamp: string | undefined): PeakClass {
  const kind = peakBillingKind(provider, model)
  if (!kind) return 'unknown'
  const instant = parseInstant(timestamp)
  if (!instant) return 'unknown'
  const peak = kind === 'deepseek-usd' ? isDeepSeekPeak(instant) : isZaiPeak(instant)
  return peak ? 'peak' : 'off-peak'
}

/// Providers that price a DeepSeek model on their own card. The same model id
/// logged by a coding tool is DeepSeek's bill; these are not.
const DEEPSEEK_UNIFORM_PRICE_PROVIDERS: ReadonlySet<string> = new Set([
  'openrouter',
  'zerostack',
  'vercel-gateway',
])

let gatewayRouteIds: ReadonlySet<string> | null = null

function isGatewayRoute(route: string | null | undefined): boolean {
  if (!route) return false
  if (!gatewayRouteIds) gatewayRouteIds = new Set(registeredRouteIds())
  return gatewayRouteIds.has(route)
}

/// A DeepSeek API model: a bare id (`deepseek-v4-pro`) or the maker prefix
/// (`deepseek/deepseek-v4-pro`). Any other first namespace is a gateway or
/// reseller path and keeps that vendor's price. The leaf check is the same
/// one dsh uses, so Claude transcripts and OpenCode rows accept one set of ids.
function isDeepSeekApiModel(model: string): boolean {
  if (!model || typeof model !== 'string') return false
  const lower = model.trim().toLowerCase()
  const slash = lower.indexOf('/')
  if (slash !== -1 && lower.slice(0, slash) !== 'deepseek') return false
  return peakBillingKind('dsh', lower) === 'deepseek-usd'
}

function billsDeepSeekSchedule(provider: string, model: string, route?: string | null): boolean {
  if (DEEPSEEK_UNIFORM_PRICE_PROVIDERS.has(provider)) return false
  if (isGatewayRoute(route)) return false
  return isDeepSeekApiModel(model)
}

/// Scale a peak-list cost to the rate in force at `timestamp`.
/// 1 at peak, DEEPSEEK_OFF_PEAK_FACTOR off-peak.
/// Missing or unparseable timestamps stay at 1 (the peak list rate): off-peak
/// is a discount, applied only when the call's own timestamp proves the window.
/// A gateway provider, a gateway route, or a non-DeepSeek model also stays at 1.
/// `route` is the billing door recorded beside the tool (OpenCode's providerID
/// when it is OpenRouter, Bedrock, or Vertex). The tool name itself is not a gate.
export function deepSeekUsdBillFactor(
  provider: string,
  model: string,
  timestamp: string | undefined,
  route?: string | null,
): number {
  if (!billsDeepSeekSchedule(provider, model, route)) return 1
  const instant = parseInstant(timestamp)
  if (!instant) return 1
  return isDeepSeekPeak(instant) ? 1 : DEEPSEEK_OFF_PEAK_FACTOR
}
