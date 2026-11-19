import { atom, read, update } from 'claude-code'
import type { Register, SessionRateLimit } from 'claude-code'

import type { ClaudeTokens, CodexInfo, Window } from '../types'

const PANE = 'limits'
const OPEN = { id: PANE, title: 'Лимиты', columns: 46 } as const
const TAIL = 262144

let codexSessions: string | undefined

async function sessionsDir($: any): Promise<string | undefined> {
  if (codexSessions) return codexSessions
  const codexHome: string | undefined = await $.env.get('CODEX_HOME')
  const home: string | undefined = (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME'))
  const base = codexHome ?? (home ? `${home}/.codex` : undefined)
  if (!base) return undefined
  codexSessions = `${base.replace(/\\/g, '/')}/sessions`
  return codexSessions
}

const ZERO: ClaudeTokens = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, turns: 0 }
const EMPTY_CODEX: CodexInfo = { sessionTokens: 0, sessionThreads: 0, checkedAt: 0 }
const claudeTokens = atom({ plugin: 'limits', key: 'claudeTokens' } as const, ZERO, { shape: 'tokens-1' })
const codex = atom({ plugin: 'limits', key: 'codex' } as const, EMPTY_CODEX, { shape: 'codex-1' })

let timerStarted = false

const pad = (n: number) => String(n).padStart(2, '0')
const fmtNum = (n: number) =>
  n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(n)
const bar = (pct: number, width = 20) => {
  const full = Math.round((Math.min(100, Math.max(0, pct)) / 100) * width)
  return '█'.repeat(full) + '░'.repeat(width - full)
}
const colorFor = (pct: number) => (pct >= 85 ? 'red' : pct >= 60 ? 'yellow' : 'green')
const fmtReset = (ms: number | undefined, now: number) => {
  if (ms === undefined) return ''
  const left = Math.max(0, ms - now)
  const h = Math.floor(left / 3600000)
  const m = Math.floor((left % 3600000) / 60000)
  const d = new Date(ms)
  const when = `${pad(d.getDate())}.${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  const leftText = h >= 24 ? `${Math.floor(h / 24)}д ${h % 24}ч` : `${h}ч ${m}м`
  return `сброс через ${leftText} (${when})`
}

const dayDir = (root: string, t: number) => {
  const d = new Date(t)
  return `${root}/${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}`
}

type Rollout = { path: string; mtimeMs: number }
type TokenCount = { total?: number; rl?: any; model?: string }

async function recentRollouts($: any, now: number): Promise<Rollout[]> {
  const out: Rollout[] = []
  const root = await sessionsDir($)
  if (!root) return out
  for (let back = 0; back < 8; back++) {
    const dir = dayDir(root, now - back * 86400000)
    const entries = await $.fs.list(dir).catch(() => [])
    for (const e of entries) {
      if (e.kind === 'file' && e.name.endsWith('.jsonl')) out.push({ path: `${dir}/${e.name}`, mtimeMs: e.mtimeMs })
    }
  }
  return out.sort((a, b) => b.mtimeMs - a.mtimeMs)
}

async function lastTokenCount($: any, path: string): Promise<TokenCount> {
  const { size } = await $.fs.stat(path)
  const offset = Math.max(0, size - TAIL)
  const text: string = await $.fs.read(path, { offset, length: size - offset })
  const lines = text.split('\n')
  const found: TokenCount = {}
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i] ?? ''
    if (found.model === undefined && line.includes('"model":"')) {
      const m = /"model":"([^"]+)"/.exec(line)
      if (m) found.model = m[1]
    }
    if (found.total === undefined && line.includes('"token_count"')) {
      try {
        const p = JSON.parse(line).payload
        found.total = p?.info?.total_token_usage?.total_tokens
        if (p?.rate_limits?.primary) found.rl = p.rate_limits
      } catch {}
    }
    if (found.total !== undefined && found.model !== undefined) break
  }
  return found
}

const toWindow = (w: any): Window | undefined =>
  w && typeof w.used_percent === 'number'
    ? { percent: w.used_percent, resetsAt: typeof w.resets_at === 'number' ? w.resets_at * 1000 : undefined }
    : undefined

async function refreshCodex($: any) {
  const now = await $.clock.now()
  const { startedAt } = await $.session.usage()
  const files = await recentRollouts($, now)
  let rl: any
  let model: string | undefined
  let sessionTokens = 0
  let sessionThreads = 0
  for (const f of files) {
    const isSession = f.mtimeMs >= startedAt
    if (!isSession && rl) break
    const tc = await lastTokenCount($, f.path).catch(() => ({}) as TokenCount)
    if (!rl && tc.rl) rl = tc.rl
    if (!model && tc.model) model = tc.model
    if (isSession && typeof tc.total === 'number') {
      sessionTokens += tc.total
      sessionThreads += 1
    }
  }
  const info: CodexInfo = {
    fiveHour: toWindow(rl?.primary),
    week: toWindow(rl?.secondary),
    plan: rl?.plan_type ?? undefined,
    model,
    sessionTokens,
    sessionThreads,
    checkedAt: now,
  }
  await update($, codex, () => info)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'limits', description: 'Показать панель лимитов Claude и Codex' })
    const started = await next(e)
    if ((await $.session.surfaces()).length > 0) void $.ui.open(OPEN)
    if (!timerStarted) {
      timerStarted = true
      void refreshCodex($).catch(() => {})
      $.clock.every(30000, () => void refreshCodex($).catch(() => {}))
    }
    return started
  })

  on('session.attach', async ($, e, next) => {
    const attached = await next(e)
    void $.ui.open(OPEN)
    return attached
  })

  on('command.run', { command: 'limits' }, async $ => {
    await $.ui.open(OPEN)
    void refreshCodex($).catch(() => {})
    return { text: 'Панель лимитов открыта.' }
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    const u = done.usage
    if (u) {
      await update($, claudeTokens, t => ({
        input: t.input + u.input_tokens,
        output: t.output + u.output_tokens,
        cacheRead: t.cacheRead + u.cache_read_input_tokens,
        cacheWrite: t.cacheWrite + u.cache_creation_input_tokens,
        turns: t.turns + 1,
      }))
    }
    void refreshCodex($).catch(() => {})
    return done
  })

  on('session.measure', async ($, e, next) => {
    const r = await next(e)
    await update($, claudeTokens, t => ({ ...t }))
    return r
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const now = await $.clock.now()
    const usage = await $.session.usage()
    const tok = await read($, claudeTokens)
    const cx = await read($, codex)

    const claudeWin = (kind: string): Window | undefined => {
      const r = usage.rateLimits.find((x: SessionRateLimit) => x.kind === kind)
      return r ? { percent: r.percentUsed, resetsAt: r.resetsAt ? Date.parse(r.resetsAt) : undefined } : undefined
    }

    const row = (label: string, w: Window | undefined) => (
      <Box flexDirection="column" marginBottom={1}>
        <Text>
          {label}{' '}
          {w ? (
            <Text bold color={colorFor(w.percent)}>
              {w.percent.toFixed(0)}%
            </Text>
          ) : (
            <Text dimColor>нет данных</Text>
          )}
        </Text>
        {w && <Text color={colorFor(w.percent)}>{bar(w.percent)}</Text>}
        {w && w.resetsAt !== undefined && <Text dimColor>{fmtReset(w.resetsAt, now)}</Text>}
      </Box>
    )

    const totalClaude = tok.input + tok.output + tok.cacheRead + tok.cacheWrite

    return (
      <Box flexDirection="column">
        <Text bold color="#d97757">
          ● Claude
        </Text>
        {row('5 часов', claudeWin('five_hour'))}
        {row('Неделя', claudeWin('seven_day'))}
        <Text bold>Эта сессия</Text>
        <Text>
          Токенов: <Text bold>{fmtNum(totalClaude)}</Text> · ходов: {tok.turns}
        </Text>
        <Text dimColor>
          вход {fmtNum(tok.input)} · выход {fmtNum(tok.output)}
        </Text>
        <Text dimColor>
          кэш: чтение {fmtNum(tok.cacheRead)} · запись {fmtNum(tok.cacheWrite)}
        </Text>
        {usage.cost && <Text dimColor>≈ ${usage.cost.usd.toFixed(2)} по API-ценам</Text>}
        {usage.context.percent !== undefined && (
          <Text dimColor>
            контекст: {usage.context.percent}% из {fmtNum(usage.context.window)}
          </Text>
        )}
        <Text> </Text>
        <Text bold color="#10a37f">
          ● Codex{cx.plan ? ` (${cx.plan})` : ''}
        </Text>
        {cx.model && <Text dimColor>модель: {cx.model}</Text>}
        {row('5 часов', cx.fiveHour)}
        {row('Неделя', cx.week)}
        <Text>
          За сессию: <Text bold>{fmtNum(cx.sessionTokens)}</Text> токенов · задач: {cx.sessionThreads}
        </Text>
        <Text dimColor>
          {cx.checkedAt ? `обновлено ${new Date(cx.checkedAt).toLocaleTimeString('ru-RU')}` : 'загрузка…'}
        </Text>
      </Box>
    )
  })
}
