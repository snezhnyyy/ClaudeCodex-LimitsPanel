import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { CodexInfo, Window } from '../types'
import { sameWindow } from './claude-limits'

const codex = atom(
  { plugin: 'limits', key: 'codex' },
  { sessionTokens: 0, sessionThreads: 0, checkedAt: 0 },
  { shape: 'codex-1' },
)

export function readCodex($: EngineInterface) {
  return read($, codex)
}

const TAIL = 262144
const STORE_KEY = 'codex-windows-1'
type CachedCodex = Omit<CodexInfo, 'sessionTokens' | 'sessionThreads'>
type Rollout = { path: string; mtimeMs: number; day: string }
type RateWindow = { used_percent?: unknown; resets_at?: unknown }
type RateLimits = { primary?: RateWindow; secondary?: RateWindow; plan_type?: unknown }
type TokenCount = { total?: number; limits?: RateLimits; model?: string }
type Scan = { newest: Rollout | undefined; startedAt: number; live?: RateLimits }

let codexSessions: string | undefined
let codexBase: string | undefined
// The live numbers, as the Codex app shows them: asked at most about once a minute.
const LIVE_URL = 'https://chatgpt.com/backend-api/wham/usage'
const LIVE_MS = 55_000
let live: { at: number; limits: RateLimits | undefined } | undefined
let lastScan: Scan | undefined
// Older rollouts rarely change: keep what their tail said, keyed by path and mtime.
const tails = new Map<string, { mtimeMs: number; count: TokenCount }>()

async function sessionsDir($: EngineInterface): Promise<string | undefined> {
  if (codexSessions) return codexSessions
  const codexHome = await $.env.get('CODEX_HOME')
  const home = (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME'))
  const base = codexHome ?? (home ? `${home}/.codex` : undefined)
  if (!base) return undefined
  codexBase = base.replace(/\\/g, '/')
  codexSessions = `${codexBase}/sessions`
  return codexSessions
}

const pad = (n: number) => String(n).padStart(2, '0')

export function dayKey(ms: number) {
  const day = new Date(ms)
  return `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`
}

async function recentRollouts($: EngineInterface, now: number): Promise<Rollout[]> {
  const root = await sessionsDir($)
  if (!root) return []
  const out: Rollout[] = []
  for (let back = 0; back < 8; back++) {
    const day = new Date(now)
    day.setDate(day.getDate() - back)
    const dir = `${root}/${day.getFullYear()}/${pad(day.getMonth() + 1)}/${pad(day.getDate())}`
    const entries = await $.fs.list(dir).catch(() => [])
    for (const e of entries) {
      if (e.kind === 'file' && e.name.endsWith('.jsonl')) {
        out.push({ path: `${dir}/${e.name}`, mtimeMs: e.mtimeMs, day: dayKey(day.getTime()) })
      }
    }
  }
  return out.sort((a, b) => b.mtimeMs - a.mtimeMs)
}

async function lastTokenCount($: EngineInterface, path: string): Promise<TokenCount> {
  const { size } = await $.fs.stat(path)
  if (!size) return {}
  const offset = Math.max(0, size - TAIL)
  const text = await $.fs.read(path, { offset, length: size - offset })
  const lines = text.split('\n')
  const found: TokenCount = {}
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i] ?? ''
    found.model ??= /"model":"([^"]+)"/.exec(line)?.[1]
    if ((!found.limits || found.total === undefined) && line.includes('"token_count"')) {
      try {
        const payload = JSON.parse(line).payload as {
          info?: { total_token_usage?: { total_tokens?: unknown } }
          rate_limits?: RateLimits
        } | undefined
        const total = payload?.info?.total_token_usage?.total_tokens
        if (typeof total === 'number' && Number.isFinite(total)) found.total ??= total
        if (payload?.rate_limits?.primary || payload?.rate_limits?.secondary) found.limits ??= payload.rate_limits
      } catch {
        // A tail can start or end in the middle of a record.
      }
    }
    if (found.total !== undefined && found.model !== undefined && found.limits) break
  }
  return found
}

type LiveWindow = { used_percent?: unknown; reset_at?: unknown; reset_after_seconds?: unknown }

function fromLive(raw: LiveWindow | undefined, now: number): RateWindow | undefined {
  if (!raw || typeof raw.used_percent !== 'number') return undefined
  const resets_at = typeof raw.reset_at === 'number' ? raw.reset_at
    : typeof raw.reset_after_seconds === 'number' ? now / 1000 + raw.reset_after_seconds : undefined
  return { used_percent: raw.used_percent, resets_at }
}

/** The limits from the endpoint the Codex app reads; undefined when it can't be reached. */
async function liveLimits($: EngineInterface, now: number): Promise<RateLimits | undefined> {
  if (live && now >= live.at && now - live.at < LIVE_MS) return live.limits
  let limits: RateLimits | undefined
  try {
    await sessionsDir($)
    if (codexBase) {
      const auth = JSON.parse(await $.fs.read(`${codexBase}/auth.json`)) as {
        tokens?: { access_token?: unknown; account_id?: unknown }
      }
      const token = auth.tokens?.access_token
      if (typeof token === 'string' && token) {
        const headers: Record<string, string> = { Authorization: `Bearer ${token}`, 'User-Agent': 'codex_cli_rs' }
        if (typeof auth.tokens?.account_id === 'string') headers['ChatGPT-Account-Id'] = auth.tokens.account_id
        const res = await $.http.fetch(LIVE_URL, { headers })
        if (res.ok) {
          const body = JSON.parse(res.text) as {
            plan_type?: unknown
            rate_limit?: { primary_window?: LiveWindow; secondary_window?: LiveWindow }
          }
          const primary = fromLive(body.rate_limit?.primary_window, now)
          const secondary = fromLive(body.rate_limit?.secondary_window, now)
          if (primary || secondary) limits = { primary, secondary, plan_type: body.plan_type }
        }
      }
    }
  } catch {
    // No login, no network or a new answer shape: the rollouts still say something.
  }
  live = { at: now, limits }
  return limits
}

function toWindow(raw: RateWindow | undefined): Window | undefined {
  if (typeof raw?.used_percent !== 'number' || !Number.isFinite(raw.used_percent)) return undefined
  const resetsAt = typeof raw.resets_at === 'number' && Number.isFinite(raw.resets_at) ? raw.resets_at * 1000 : undefined
  return { percent: Math.max(0, Math.min(100, raw.used_percent)), resetsAt }
}

export async function readCodexCache($: EngineInterface): Promise<CachedCodex | undefined> {
  return await $.store.get(STORE_KEY) as CachedCodex | undefined
}

function sameLimits(a: CachedCodex, b: CachedCodex) {
  return sameWindow(a.fiveHour, b.fiveHour) && sameWindow(a.week, b.week) &&
    a.plan === b.plan && a.model === b.model
}

function sameDays(a: Record<string, number> | undefined, b: Record<string, number>) {
  if (!a) return false
  const keys = Object.keys(b)
  return keys.length === Object.keys(a).length && keys.every(key => a[key] === b[key])
}

export async function refreshCodex($: EngineInterface, now: number, startedAt: number) {
  const files = await recentRollouts($, now)
  const newest = files[0]
  const fresh = await liveLimits($, now)
  if (JSON.stringify(lastScan?.live) === JSON.stringify(fresh) &&
    lastScan?.startedAt === startedAt && lastScan.newest?.path === newest?.path &&
    lastScan.newest?.mtimeMs === newest?.mtimeMs) return false

  let limits: RateLimits | undefined = fresh
  let model: string | undefined
  let sessionTokens = 0
  let sessionThreads = 0
  let complete = true
  const days: Record<string, number> = {}
  for (const file of files) {
    const isSession = file.mtimeMs >= startedAt
    const cached = tails.get(file.path)
    let count: TokenCount
    if (cached?.mtimeMs === file.mtimeMs) count = cached.count
    else {
      try {
        count = await lastTokenCount($, file.path)
        tails.set(file.path, { mtimeMs: file.mtimeMs, count })
      } catch {
        complete = false
        count = {}
      }
    }
    limits ??= count.limits
    model ??= count.model
    if (count.total !== undefined) days[file.day] = (days[file.day] ?? 0) + count.total
    if (isSession && count.total !== undefined) {
      sessionTokens += count.total
      sessionThreads += 1
    }
  }
  const live = new Set(files.map(file => file.path))
  for (const path of tails.keys()) if (!live.has(path)) tails.delete(path)
  const info: CodexInfo = {
    fiveHour: toWindow(limits?.primary),
    week: toWindow(limits?.secondary),
    plan: typeof limits?.plan_type === 'string' ? limits.plan_type : undefined,
    model,
    sessionTokens,
    sessionThreads,
    checkedAt: now,
    days,
  }
  if (info.fiveHour || info.week) {
    const old = await readCodexCache($)
    const cached: CachedCodex = {
      fiveHour: info.fiveHour ?? old?.fiveHour,
      week: info.week ?? old?.week,
      plan: info.plan ?? old?.plan,
      model: info.model ?? old?.model,
      checkedAt: now,
    }
    if (!old || (now >= old.checkedAt && !sameLimits(old, cached))) await $.store.set(STORE_KEY, cached)
  }

  const previous = await readCodex($)
  const changed = previous.checkedAt <= now && (!sameLimits(previous, info) ||
    previous.sessionTokens !== info.sessionTokens || previous.sessionThreads !== info.sessionThreads ||
    !sameDays(previous.days, days))
  if (changed) await update($, codex, () => info)
  if (complete) lastScan = { newest, startedAt, live: fresh }
  return changed
}
