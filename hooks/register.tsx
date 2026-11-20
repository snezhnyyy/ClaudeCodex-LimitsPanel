import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionUsage, Timer } from 'claude-code'

import type { ClaudeMeasurement, ClaudeTokens } from '../types'
import { claudeWindow, codexWindow, HOUR, liveWindow, observeClaudeLimits, readSnapshots, sameWindow } from './claude-limits'
import { dayKey, readCodex, readCodexCache, refreshCodex } from './codex'
import { drawPane } from './pane'
import type { PaneElements, Preference } from './pane'

const PANE = 'limits'
const OPEN = { id: PANE, title: 'Лимиты', columns: 46 } as const
const POLL_MS = 60_000
const ZERO: ClaudeTokens = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, turns: 0 }
const claudeTokens = atom({ plugin: 'limits', key: 'claudeTokens' }, ZERO, { shape: 'tokens-1' })
const claudeMeasurement = atom({ plugin: 'limits', key: 'claudeMeasurement' }, null, { shape: 'measurement-1' })
const turnHistory = atom({ plugin: 'limits', key: 'turnHistory' }, [], { shape: 'turn-history-1' })
const DAYS_KEY = 'claude-days-1'
const DAY = 24 * HOUR
const PREFERENCES = ['collapse-claude', 'collapse-codex', 'cost-shawarma'] as const

async function readPreferences($: EngineInterface): Promise<Record<Preference, boolean>> {
  const [claude, codex, shawarma] = await Promise.all(PREFERENCES.map(key => $.store.get(key)))
  return { 'collapse-claude': claude === true, 'collapse-codex': codex === true, 'cost-shawarma': shawarma === true }
}

type Days = Record<string, number>

async function readClaudeDays($: EngineInterface): Promise<Days> {
  const value = await $.store.get(DAYS_KEY)
  return value && typeof value === 'object' ? value as Days : {}
}

// Claude's tokens per local day, across sessions, for the week chart.
let pendingDays = Promise.resolve()
function addClaudeDay($: EngineInterface, at: number, tokens: number) {
  const saved = pendingDays.then(async () => {
    const days = await readClaudeDays($)
    const keep = new Set(Array.from({ length: 8 }, (_, back) => dayKey(at - back * DAY)))
    const next: Days = {}
    for (const [key, value] of Object.entries(days)) if (keep.has(key)) next[key] = value
    const today = dayKey(at)
    next[today] = (next[today] ?? 0) + tokens
    await $.store.set(DAYS_KEY, next)
  })
  pendingDays = saved.catch(() => {})
  return pendingDays
}

async function toggle($: EngineInterface, key: Preference) {
  await $.store.set(key, (await $.store.get(key)) !== true)
  $.ui.invalidate('ui.render')
}

function measurement(usage: Pick<SessionUsage, 'context' | 'cost' | 'rateLimits'>): ClaudeMeasurement {
  return {
    contextPercent: usage.context.percent,
    costUsd: usage.cost?.usd,
    fiveHour: liveWindow(usage.rateLimits, 'five_hour'),
    week: liveWindow(usage.rateLimits, 'seven_day'),
  }
}

async function readLimits($: EngineInterface, measured: ClaudeMeasurement, now: number) {
  const [stored, cx, cache] = await Promise.all([readSnapshots($), readCodex($), readCodexCache($)])
  return {
    claude: [
      claudeWindow(measured.fiveHour, stored, 'five_hour', now),
      claudeWindow(measured.week, stored, 'seven_day', now),
    ] as const,
    codex: [codexWindow(cx.fiveHour ?? cache?.fiveHour, now), codexWindow(cx.week ?? cache?.week, now)] as const,
    codexInfo: { ...cx, model: cx.model ?? cache?.model, plan: cx.plan ?? cache?.plan },
  }
}

async function redrawClock($: EngineInterface, usage: SessionUsage, previous: number, now: number) {
  const [{ claude, codex }, preferences, history] = await Promise.all([
    readLimits($, measurement(usage), previous),
    readPreferences($),
    read($, turnHistory),
  ])
  const countdownChanged = (windows: typeof claude, collapsed: boolean) => windows.some(window => {
    const reset = window?.resetsAt
    return reset !== undefined && reset > previous && (!collapsed || reset <= now)
  })
  const burnChanged = !preferences['collapse-claude'] && history.some(turn =>
    turn.tokens > 0 && turn.at > previous - HOUR && turn.at <= now - HOUR,
  )
  if (burnChanged || countdownChanged(claude, preferences['collapse-claude']) ||
    countdownChanged(codex, preferences['collapse-codex'])) $.ui.invalidate('ui.render')
}

let timer: Timer | undefined
let pendingMeasure = Promise.resolve()

function startPolling($: EngineInterface) {
  if (timer) return
  let lastTick: number | undefined
  let polling = false

  async function poll() {
    if (polling) return
    polling = true
    try {
      const [now, usage] = await Promise.all([$.clock.now(), $.session.usage()])
      const previous = lastTick
      lastTick = now
      const [, codexRefresh] = await Promise.allSettled([
        observeClaudeLimits($, now, usage.rateLimits),
        refreshCodex($, now, usage.startedAt),
      ])
      if (previous !== undefined && (codexRefresh.status === 'rejected' || !codexRefresh.value)) {
        await redrawClock($, usage, previous, now)
      }
    } finally {
      polling = false
    }
  }

  const tick = () => void poll().catch(() => {})
  timer = $.clock.every(POLL_MS, tick)
  tick()
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'limits', description: 'Показать панель лимитов Claude и Codex' })
    const started = await next(e)
    if ((await $.session.surfaces()).length > 0) void $.ui.open(OPEN)
    startPolling($)
    return started
  })

  on('session.attach', async ($, e, next) => {
    const attached = await next(e)
    void $.ui.open(OPEN)
    startPolling($)
    return attached
  })

  on('session.end', ($, e, next) => {
    timer?.cancel()
    timer = undefined
    return next(e)
  })

  on('command.run', { command: 'limits' }, async $ => {
    await $.ui.open(OPEN)
    startPolling($)
    return { text: 'Панель лимитов открыта.' }
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    const usage = done.usage
    if (usage) {
      const at = await $.clock.now()
      const input = usage.input_tokens
      const output = usage.output_tokens
      const cacheRead = usage.cache_read_input_tokens
      const cacheWrite = usage.cache_creation_input_tokens
      const tokens = input + output + cacheRead + cacheWrite
      await addClaudeDay($, at, tokens)
      await Promise.all([
        update($, claudeTokens, t => ({
          input: t.input + input,
          output: t.output + output,
          cacheRead: t.cacheRead + cacheRead,
          cacheWrite: t.cacheWrite + cacheWrite,
          turns: t.turns + 1,
        })),
        update($, turnHistory, history => {
          const samples = [...history, { at, tokens }].sort((a, b) => a.at - b.at)
          const cutoff = (samples.at(-1)?.at ?? at) - HOUR
          return samples.filter(sample => sample.at > cutoff)
        }),
      ])
    }
    return done
  })

  on('session.measure', async ($, e, next) => {
    const measured = await next(e)
    const recorded = pendingMeasure.then(async () => {
      const previous = await read($, claudeMeasurement)
      const current = measurement(e)
      const limitsChanged = !sameWindow(previous?.fiveHour, current.fiveHour) || !sameWindow(previous?.week, current.week)
      if (limitsChanged && e.rateLimits.length) {
        await observeClaudeLimits($, await $.clock.now(), e.rateLimits).catch(() => {})
      }
      if (!previous || limitsChanged || previous.contextPercent !== current.contextPercent || previous.costUsd !== current.costUsd) {
        await update($, claudeMeasurement, () => current)
      }
    })
    pendingMeasure = recorded.catch(() => {})
    await pendingMeasure
    return measured
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const ui: PaneElements = { ...$.ui.resolve(e), terminal: e.surface === 'terminal' }
    const [now, latest, tokens, history, preferences, claudeDays] = await Promise.all([
      $.clock.now(),
      read($, claudeMeasurement),
      read($, claudeTokens),
      read($, turnHistory),
      readPreferences($),
      readClaudeDays($),
    ])
    const measured = latest ?? measurement(await $.session.usage())

    return drawPane(ui, {
      now, tokens, history, preferences, claudeDays,
      columns: e.props.bodyColumns,
      contextPercent: measured.contextPercent,
      costUsd: measured.costUsd,
      ...await readLimits($, measured, now),
      toggle: key => toggle($, key),
    })
  })
}
