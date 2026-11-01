import { describe, expect, it } from 'vitest'

import {
  classifyPeak,
  deepSeekHolidayCoverageYears,
  deepSeekPhase,
  deepSeekUsdBillFactor,
  isDeepSeekPeak,
  isZaiPeak,
  nextDeepSeekPhaseChange,
  peakBillingKind,
} from '../src/peak-hours.js'

const at = (iso: string): Date => new Date(iso)

describe('isDeepSeekPeak', () => {
  it('is peak on a weekday inside 01:00-04:00 UTC', () => {
    // Monday 2026-09-28.
    expect(isDeepSeekPeak(at('2026-09-28T01:00:00Z'))).toBe(true)
    expect(isDeepSeekPeak(at('2026-09-28T02:30:00Z'))).toBe(true)
    expect(isDeepSeekPeak(at('2026-09-28T03:59:59Z'))).toBe(true)
  })

  it('is peak on a weekday inside 06:00-10:00 UTC', () => {
    expect(isDeepSeekPeak(at('2026-09-28T06:00:00Z'))).toBe(true)
    expect(isDeepSeekPeak(at('2026-09-28T09:59:59Z'))).toBe(true)
  })

  it('is off-peak in the gaps between windows', () => {
    expect(isDeepSeekPeak(at('2026-09-28T00:59:59Z'))).toBe(false)
    expect(isDeepSeekPeak(at('2026-09-28T04:00:00Z'))).toBe(false)
    expect(isDeepSeekPeak(at('2026-09-28T05:30:00Z'))).toBe(false)
    expect(isDeepSeekPeak(at('2026-09-28T10:00:00Z'))).toBe(false)
    expect(isDeepSeekPeak(at('2026-09-28T23:00:00Z'))).toBe(false)
  })

  it('is off-peak on weekends', () => {
    // Saturday 2026-09-26, Sunday 2026-09-27.
    expect(isDeepSeekPeak(at('2026-09-26T02:00:00Z'))).toBe(false)
    expect(isDeepSeekPeak(at('2026-09-27T08:00:00Z'))).toBe(false)
  })

  it('is off-peak on Chinese public holidays', () => {
    // Mid-Autumn 2026-09-25 is a Friday; National Day 2026-10-01 is a Thursday.
    expect(isDeepSeekPeak(at('2026-09-25T02:00:00Z'))).toBe(false)
    expect(isDeepSeekPeak(at('2026-10-01T08:00:00Z'))).toBe(false)
  })
})

describe('isZaiPeak', () => {
  // Monday 2026-09-21 sits outside the 2026-09-25..2026-10-07 promotion, so
  // these pin the plain weekly window.
  it('is peak Mon-Fri 14:00-18:00 SGT (06:00-10:00 UTC)', () => {
    expect(isZaiPeak(at('2026-09-21T06:00:00Z'))).toBe(true)
    expect(isZaiPeak(at('2026-09-21T09:59:59Z'))).toBe(true)
  })

  it('is off-peak outside the SGT window', () => {
    expect(isZaiPeak(at('2026-09-21T05:59:59Z'))).toBe(false)
    expect(isZaiPeak(at('2026-09-21T10:00:00Z'))).toBe(false)
    expect(isZaiPeak(at('2026-09-21T02:00:00Z'))).toBe(false)
  })

  it('is off-peak on weekends (no holiday exception)', () => {
    expect(isZaiPeak(at('2026-09-19T08:00:00Z'))).toBe(false)
  })

  it('treats the 2026-09-25..10-07 promotion as all-day off-peak', () => {
    // Monday 2026-09-28 and Wednesday 2026-10-07 are weekdays inside the
    // 06:00-10:00 UTC window, yet the promotion makes them off-peak.
    expect(isZaiPeak(at('2026-09-28T08:00:00Z'))).toBe(false)
    expect(isZaiPeak(at('2026-10-07T07:00:00Z'))).toBe(false)
    // The Thursday after the promotion ends goes back to the weekly window.
    expect(isZaiPeak(at('2026-10-08T07:00:00Z'))).toBe(true)
  })
})

describe('deepSeekHolidayCoverageYears', () => {
  it('covers the current year and the next', () => {
    // Fails when the calendar goes stale: the current year and the following
    // year need sourced dates in src/data/chinese-public-holidays.ts.
    const year = new Date().getUTCFullYear()
    expect(deepSeekHolidayCoverageYears().has(year)).toBe(true)
    expect(deepSeekHolidayCoverageYears().has(year + 1)).toBe(true)
  })

  it('does not invent a year past the sourced calendar', () => {
    expect(deepSeekHolidayCoverageYears().has(new Date().getUTCFullYear() + 2)).toBe(false)
  })
})

describe('2027 statutory holidays', () => {
  it('treats a statutory weekday as off-peak and the next weekday as peak', () => {
    // Qingming 2027-04-05 is a Monday. Dragon Boat 2027-06-09 is a Wednesday.
    // The day after each is not on the statutory list (调休 extensions are
    // unpublished), so it is a normal peak morning.
    expect(isDeepSeekPeak(at('2027-04-05T02:00:00Z'))).toBe(false)
    expect(isDeepSeekPeak(at('2027-04-06T02:00:00Z'))).toBe(true)
    expect(isDeepSeekPeak(at('2027-06-09T08:00:00Z'))).toBe(false)
    expect(isDeepSeekPeak(at('2027-06-10T08:00:00Z'))).toBe(true)
    // National Day statutory span ends 2027-10-03; Monday 10-04 is not yet
    // a sourced holiday.
    expect(isDeepSeekPeak(at('2027-10-01T08:00:00Z'))).toBe(false)
    expect(isDeepSeekPeak(at('2027-10-04T08:00:00Z'))).toBe(true)
  })
})

describe('nextDeepSeekPhaseChange', () => {
  it('walks the weekday window edges', () => {
    // Monday 2026-09-28.
    expect(nextDeepSeekPhaseChange(at('2026-09-28T00:59:59Z')).toISOString()).toBe('2026-09-28T01:00:00.000Z')
    expect(nextDeepSeekPhaseChange(at('2026-09-28T01:00:00Z')).toISOString()).toBe('2026-09-28T04:00:00.000Z')
    expect(nextDeepSeekPhaseChange(at('2026-09-28T03:59:59Z')).toISOString()).toBe('2026-09-28T04:00:00.000Z')
    expect(nextDeepSeekPhaseChange(at('2026-09-28T04:00:00Z')).toISOString()).toBe('2026-09-28T06:00:00.000Z')
    expect(nextDeepSeekPhaseChange(at('2026-09-28T06:00:00Z')).toISOString()).toBe('2026-09-28T10:00:00.000Z')
    expect(nextDeepSeekPhaseChange(at('2026-09-28T10:00:00Z')).toISOString()).toBe('2026-09-29T01:00:00.000Z')
  })

  it('skips the weekend', () => {
    expect(nextDeepSeekPhaseChange(at('2026-09-25T12:00:00Z')).toISOString()).toBe('2026-09-28T01:00:00.000Z')
    expect(deepSeekPhase(at('2026-09-26T02:00:00Z'))).toBe('off-peak')
    expect(nextDeepSeekPhaseChange(at('2026-09-26T02:00:00Z')).toISOString()).toBe('2026-09-28T01:00:00.000Z')
  })

  it('skips a holiday that covers the next window, including a long National Day', () => {
    // Friday 2026-09-25 is Mid-Autumn, so the morning peak never starts.
    expect(deepSeekPhase(at('2026-09-25T02:00:00Z'))).toBe('off-peak')
    expect(nextDeepSeekPhaseChange(at('2026-09-25T02:00:00Z')).toISOString()).toBe('2026-09-28T01:00:00.000Z')
    // National Day 2026-10-01..10-07. The next peak morning is Thursday 10-08.
    expect(nextDeepSeekPhaseChange(at('2026-10-01T08:00:00Z')).toISOString()).toBe('2026-10-08T01:00:00.000Z')
  })
})

describe('deepSeekUsdBillFactor', () => {
  it('is half off-peak and full at peak for first-party and Claude-compatible DeepSeek calls', () => {
    expect(deepSeekUsdBillFactor('dsh', 'deepseek-v4-pro', '2026-09-28T02:00:00Z')).toBe(1)
    expect(deepSeekUsdBillFactor('dsh', 'deepseek-v4-pro', '2026-09-28T12:00:00Z')).toBe(0.5)
    expect(deepSeekUsdBillFactor('claude', 'deepseek-flash', '2026-09-28T08:00:00Z')).toBe(1)
    expect(deepSeekUsdBillFactor('claude', 'deepseek-v4-flash', '2026-05-20T10:01:00Z')).toBe(0.5)
    expect(deepSeekUsdBillFactor('dsh', 'deepseek-chat', '2026-09-26T02:00:00Z')).toBe(0.5)
  })

  it('stays at the peak list rate without a usable timestamp', () => {
    expect(deepSeekUsdBillFactor('dsh', 'deepseek-v4-pro', undefined)).toBe(1)
    expect(deepSeekUsdBillFactor('dsh', 'deepseek-v4-pro', '')).toBe(1)
    expect(deepSeekUsdBillFactor('dsh', 'deepseek-v4-pro', 'not-a-date')).toBe(1)
    expect(deepSeekUsdBillFactor('claude', 'deepseek-flash', undefined)).toBe(1)
  })

  it('does not discount gateways, other providers, or non-DeepSeek models', () => {
    expect(deepSeekUsdBillFactor('openrouter', 'deepseek/deepseek-v4-pro', '2026-09-28T12:00:00Z')).toBe(1)
    expect(deepSeekUsdBillFactor('zerostack', 'deepseek/deepseek-v4-pro', '2026-09-28T12:00:00Z')).toBe(1)
    expect(deepSeekUsdBillFactor('claude', 'claude-sonnet-4-6', '2026-09-28T12:00:00Z')).toBe(1)
    expect(deepSeekUsdBillFactor('zcode', 'glm-5.3', '2026-09-21T12:00:00Z')).toBe(1)
    expect(deepSeekUsdBillFactor('dsh', 'glm-5.3', '2026-09-28T12:00:00Z')).toBe(1)
  })
})

describe('peakBillingKind', () => {
  it('maps first-party DeepSeek routes to USD peak billing', () => {
    expect(peakBillingKind('dsh', 'deepseek-chat')).toBe('deepseek-usd')
    expect(peakBillingKind('dsh', 'deepseek/deepseek-chat')).toBe('deepseek-usd')
    expect(peakBillingKind('dsh', 'deepseek-reasoner')).toBe('deepseek-usd')
    expect(peakBillingKind('dsh', 'deepseek-v4-pro')).toBe('deepseek-usd')
    expect(peakBillingKind('dsh', 'deepseek-flash')).toBe('deepseek-usd')
  })

  it('maps first-party Z.ai routes to credit peak billing', () => {
    expect(peakBillingKind('zcode', 'glm-5.3')).toBe('zai-credits')
    expect(peakBillingKind('zcode', 'GLM-5.2')).toBe('zai-credits')
    expect(peakBillingKind('zcode', 'z-ai/glm-5.2')).toBe('zai-credits')
    expect(peakBillingKind('zcode', 'cliproxy/zcode/glm-5.3-flash')).toBe('zai-credits')
  })

  it('returns null through gateways, resellers and other providers', () => {
    // The same model behind a gateway pays the gateway's uniform price — no
    // vendor discount to attribute.
    expect(peakBillingKind('openrouter', 'deepseek/deepseek-chat')).toBe(null)
    expect(peakBillingKind('openrouter', 'z-ai/glm-5.2')).toBe(null)
    expect(peakBillingKind('vercel-gateway', 'glm-5.3')).toBe(null)
    expect(peakBillingKind('zerostack', 'deepseek/deepseek-v4-pro')).toBe(null)
    expect(peakBillingKind('claude', 'glm-5.3')).toBe(null)
  })

  it('returns null when provider and model vendor disagree', () => {
    expect(peakBillingKind('dsh', 'glm-5.3')).toBe(null)
    expect(peakBillingKind('zcode', 'deepseek-chat')).toBe(null)
  })

  it('returns null for unrelated models and junk', () => {
    expect(peakBillingKind('dsh', 'claude-sonnet-4-6')).toBe(null)
    expect(peakBillingKind('zcode', 'gpt-5.5')).toBe(null)
    expect(peakBillingKind('dsh', '')).toBe(null)
  })
})

describe('classifyPeak', () => {
  it('classifies a first-party DeepSeek call by its timestamp', () => {
    expect(classifyPeak('dsh', 'deepseek-chat', '2026-09-28T02:00:00Z')).toBe('peak')
    expect(classifyPeak('dsh', 'deepseek-chat', '2026-09-28T12:00:00Z')).toBe('off-peak')
  })

  it('classifies a first-party GLM call by the Z.ai window', () => {
    // 2026-09-21 is outside the Sep 25 - Oct 7 promotion.
    expect(classifyPeak('zcode', 'glm-5.3', '2026-09-21T08:00:00Z')).toBe('peak')
    expect(classifyPeak('zcode', 'glm-5.3', '2026-09-21T12:00:00Z')).toBe('off-peak')
  })

  it('returns unknown through gateways and provider/model mismatches', () => {
    expect(classifyPeak('openrouter', 'deepseek/deepseek-chat', '2026-09-28T02:00:00Z')).toBe('unknown')
    expect(classifyPeak('vercel-gateway', 'glm-5.3', '2026-09-21T08:00:00Z')).toBe('unknown')
    expect(classifyPeak('dsh', 'glm-5.3', '2026-09-28T02:00:00Z')).toBe('unknown')
  })

  it('returns unknown without a model match or timestamp', () => {
    expect(classifyPeak('dsh', 'gpt-5.5', '2026-09-28T02:00:00Z')).toBe('unknown')
    expect(classifyPeak('dsh', 'deepseek-chat', undefined)).toBe('unknown')
    expect(classifyPeak('dsh', 'deepseek-chat', 'not-a-date')).toBe('unknown')
  })
})
