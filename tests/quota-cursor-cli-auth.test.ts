// Coverage for the Cursor CLI (cursor-agent) auth.json fallback shared by the
// Cursor and Grok Bot quota rows. Fake tokens and temp files only; nothing
// reads the operator's real CLI login or touches the network.
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  cursorAccessTokenFromCliAuth,
  cursorCliAuthPaths,
  fetchCursorQuota,
  resolveCursorAccessToken,
} from '../src/quota/cursor.js'
import { fetchGrokbotQuota } from '../src/quota/grokbot.js'

const NOW = Date.parse('2026-08-15T12:00:00Z')

function fakeJWT(expiresAt = NOW + 3_600_000, subject = 'auth0|user_cli'): string {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value), 'utf8').toString('base64url')
  return `${encode({ alg: 'HS256' })}.${encode({ sub: subject, exp: Math.floor(expiresAt / 1000) })}.signature`
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
}

describe('cursorCliAuthPaths', () => {
  it('defaults to ~/.config/cursor/auth.json', () => {
    expect(cursorCliAuthPaths({}, '/home/u')).toEqual(['/home/u/.config/cursor/auth.json'])
  })

  it('respects XDG_CONFIG_HOME and puts the env then config override first', () => {
    expect(cursorCliAuthPaths(
      { XDG_CONFIG_HOME: '/xdg', CODEBURN_CURSOR_AUTH_FILE: '/sandbox/auth.json' },
      '/home/u',
      '~/other/auth.json',
    )).toEqual(['/sandbox/auth.json', '/home/u/other/auth.json', '/xdg/cursor/auth.json'])
  })

  it('ignores a relative XDG_CONFIG_HOME and de-duplicates', () => {
    expect(cursorCliAuthPaths(
      { XDG_CONFIG_HOME: 'relative', CODEBURN_CURSOR_AUTH_FILE: '/home/u/.config/cursor/auth.json' },
      '/home/u',
    )).toEqual(['/home/u/.config/cursor/auth.json'])
  })
})

describe('cursorAccessTokenFromCliAuth', () => {
  let dir = ''
  beforeEach(async () => { dir = await mkdtemp(path.join(os.tmpdir(), 'codeburn-cursor-cli-')) })
  afterEach(async () => { await rm(dir, { recursive: true, force: true }) })

  const write = async (name: string, body: string) => {
    const file = path.join(dir, name)
    await writeFile(file, body)
    return file
  }

  it('skips missing, malformed and expired files and picks the live token', async () => {
    const live = fakeJWT()
    const files = [
      path.join(dir, 'missing.json'),
      await write('bad.json', '{not json'),
      await write('expired.json', JSON.stringify({ accessToken: fakeJWT(NOW - 1000), refreshToken: 'r' })),
      await write('live.json', JSON.stringify({ accessToken: live, refreshToken: 'r' })),
    ]
    expect(await cursorAccessTokenFromCliAuth(files, NOW)).toBe(live)
  })

  it('returns the first token when none is live, and null when none exists', async () => {
    const expired = fakeJWT(NOW - 1000)
    const file = await write('expired.json', JSON.stringify({ accessToken: expired }))
    expect(await cursorAccessTokenFromCliAuth([file], NOW)).toBe(expired)
    expect(await cursorAccessTokenFromCliAuth([await write('empty.json', '{}')], NOW)).toBeNull()
  })
})

describe('resolveCursorAccessToken', () => {
  const base = { databasePath: '/nonexistent' }

  it('prefers a live app session', async () => {
    const app = fakeJWT(NOW + 3_600_000, 'auth0|app')
    const result = await resolveCursorAccessToken({ ...base, loadAccessToken: async () => app, loadCliAccessToken: async () => fakeJWT() }, NOW)
    expect(result).toEqual({ token: app, source: 'app' })
  })

  it('falls back to the CLI when the app is signed out, expired or unreadable', async () => {
    const cli = fakeJWT()
    for (const loadAccessToken of [async () => null, async () => fakeJWT(NOW - 1000), async () => { throw new Error('database is locked') }]) {
      expect(await resolveCursorAccessToken({ ...base, loadAccessToken, loadCliAccessToken: async () => cli }, NOW))
        .toEqual({ token: cli, source: 'cli' })
    }
  })

  it('rethrows an app error only when the CLI has nothing', async () => {
    await expect(resolveCursorAccessToken({ ...base, loadAccessToken: async () => { throw new Error('locked') }, loadCliAccessToken: async () => null }, NOW))
      .rejects.toThrow('locked')
  })
})

describe('quota rows from the CLI session', () => {
  it('Cursor uses the CLI token as the session cookie and labels the source', async () => {
    const cli = fakeJWT()
    let cookie: string | null = null
    const result = await fetchCursorQuota({
      now: () => NOW,
      loadAccessToken: async () => null,
      loadCliAccessToken: async () => cli,
      fetch: (async (_url: string, init: RequestInit) => {
        cookie = new Headers(init.headers).get('Cookie')
        return jsonResponse({ billingCycleEnd: '2026-09-01T00:00:00Z', individualUsage: { plan: { totalPercentUsed: 10 } } })
      }) as unknown as typeof fetch,
    })
    expect(cookie).toBe(`WorkosCursorSessionToken=user_cli%3A%3A${cli}`)
    expect(result.quota.connection).toBe('connected')
    expect(result.quota.footerLines).toEqual(['Source: Cursor CLI'])
  })

  it('Grok Bot sends the CLI token as a bearer and keeps the allowance disclosure', async () => {
    const cli = fakeJWT()
    let auth: string | null = null
    const { quota } = await fetchGrokbotQuota({
      now: () => NOW,
      loadAccessToken: async () => null,
      loadCliAccessToken: async () => cli,
      fetch: (async (_url: string, init: RequestInit) => {
        auth = new Headers(init.headers).get('Authorization')
        return jsonResponse({ usagePercent: 25, hasNonZeroIncludedLimit: true })
      }) as unknown as typeof fetch,
    })
    expect(auth).toBe(`Bearer ${cli}`)
    expect(quota.connection).toBe('connected')
    expect(quota.footerLines[0]).toContain('the account the Cursor CLI is signed into')
  })
})
