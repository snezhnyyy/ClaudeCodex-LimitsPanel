import type { SessionUsage } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

const NOW = Date.UTC(2026, 10, 20, 12)
const HOUR = 3_600_000
const PANE = {
  plugin: 'limits',
  component: 'Pane',
  requestId: 'limits',
  props: {
    title: 'Лимиты',
    isFocused: false,
    bodyColumns: 46,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

test('desktop and terminal render live limits, and desktop can toggle the display', async ($, on) => {
  mock.clock(on, { now: NOW })
  mock.store(on, {
    'codex-windows-1': {
      fiveHour: { percent: 32, resetsAt: NOW + 2 * HOUR },
      week: { percent: 69, resetsAt: NOW + 24 * HOUR },
      model: 'gpt-6.2-sol', plan: 'plus', checkedAt: NOW,
    },
  })
  const usage: SessionUsage = {
    startedAt: NOW - HOUR,
    context: { window: 200_000, percent: 88 },
    cost: { usd: 0.19 },
    rateLimits: [
      { kind: 'five_hour', percentUsed: 81, resetsAt: new Date(NOW + 3 * HOUR).toISOString() },
      { kind: 'seven_day', percentUsed: 62, resetsAt: new Date(NOW + 2 * 24 * HOUR).toISOString() },
    ],
  }
  on('session.usage', () => ({ value: usage }))

  for (const surface of ['desktop', 'terminal'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ type: 'Text', text: /^81%$/ }))?.props.color).toBe('#f85149')
    expect((await ui.find({ type: 'Text', text: /^32%$/ }))?.props.color).toBe('#3fb950')
    expect((await ui.find({ type: 'Text', text: /^88%$/ }))?.props.color).toBe('#f85149')
    expect(await ui.findAll({ type: 'Text', text: /^⚠ кончится ~[А-Яа-я]{2} \d{2}:\d{2}$/ })).toHaveLength(1)
    expect(await ui.find({ type: 'Text', text: /темп в норме|Оценка по API-ценам|обновлено|токенов сессии/ })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /Отдай следующую задачу Codex/ })).toBeDefined()
    expect((await ui.find({ key: 'collapse-codex' }))?.text).toBe('● Codex')
    expect(await ui.find({ type: 'Text', text: /^gpt-6.2-sol · plus$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^Codex вместо Claude$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^сессия: Codex ещё не запускался$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^7 дней$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^Последний час$/ })).toBeDefined()
    expect((await ui.find({ key: 'cost-shawarma' }))?.text).toBe('0 · $0.19')
    const bars = await ui.findAll({ type: 'Svg' })
    expect(bars).toHaveLength(surface === 'desktop' ? 8 : 0)
    if (surface === 'desktop') {
      const bar = bars.find(({ props }) => props.alt === '5ч 32%')
      expect(bar?.props.height).toBe(8)
      expect(bar?.props.width).toBeUndefined()
      expect(bar?.props.source).toContain('width="153.60" height="6" rx="3" fill="#3fb950"')
      expect(bar?.props.source).toContain('fill-opacity="0.6"')
    } else {
      expect(await ui.find({ type: 'Text', text: /[█░]{3}/ })).toBeDefined()
    }
    await ui.unmount()
  }

  const desktop = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await desktop.press({ key: 'cost-shawarma' })
  expect((await desktop.find({ key: 'cost-shawarma' }))?.text).toBe('0 · ≈ 0.05 шаурмы')
  await desktop.press({ key: 'collapse-claude' })
  expect((await desktop.find({ key: 'collapse-claude' }))?.text).toBe('● Claude')
  expect(await desktop.find({ type: 'Text', text: /^81% · 62%$/ })).toBeDefined()
  expect(await desktop.find({ key: 'cost-shawarma' })).toBeUndefined()
  expect(await desktop.findAll({ type: 'Svg' })).toHaveLength(5)
  await desktop.press({ key: 'collapse-codex' })
  expect(await desktop.find({ type: 'Text', text: /^32% · 69%$/ })).toBeDefined()
  expect(await desktop.findAll({ type: 'Svg' })).toHaveLength(3)
  await desktop.unmount()


  const terminal = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await terminal.find({ type: 'Text', text: /^81% · 62%$/ })).toBeDefined()
  await terminal.press({ key: 'collapse-claude' })
  expect((await terminal.find({ key: 'cost-shawarma' }))?.text).toBe('0 · ≈ 0.05 шаурмы')
  await terminal.unmount()
})

test('both surfaces use stored limits before the first response and zero expired windows', async ($, on) => {
  mock.clock(on, { now: NOW })
  mock.store(on, {
    'claude-windows-1': {
      five_hour: { percent: 91, resetsAt: NOW - 1, observedAt: NOW - HOUR, notified: 80 },
      seven_day: { percent: 67, resetsAt: NOW + 2 * HOUR, observedAt: NOW - HOUR, notified: 0 },
    },
  })
  on('session.usage', () => ({
    value: { startedAt: NOW, context: { window: 200_000 }, rateLimits: [] },
  }))

  for (const surface of ['desktop', 'terminal', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ type: 'Text', text: /^0%$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^67%$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^сброшен$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /темп в норме|кончится/ })).toBeUndefined()
    await ui.unmount()
  }
})

test('measurements redraw the pane, save live limits and toast each event once', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  mock.store(on)
  const usage: SessionUsage = { startedAt: NOW, context: { window: 200_000 }, rateLimits: [] }
  const toasts: string[] = []
  let measurementWrites = 0
  on('state.set', (_, e, next) => {
    if (e.key === 'claudeMeasurement') measurementWrites++
    return next(e)
  })
  on('session.usage', () => ({ value: usage }))
  on('session.measure', (_, e) => ({ changed: e.changed }))
  on('ui.toast', (_, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /нет данных/ })).toBeDefined()

  async function measure(used: number, resetsAt = NOW + HOUR) {
    usage.rateLimits = [{ kind: 'five_hour', percentUsed: used, resetsAt: new Date(resetsAt).toISOString() }]
    await $.session.measure({ ...usage, changed: ['rateLimits'] })
  }

  await measure(79)
  expect(await ui.find({ type: 'Text', text: /^79%$/ })).toBeDefined()
  await measure(82)
  await measure(82)
  expect(measurementWrites).toBe(2)
  await measure(96)
  await measure(96)
  expect(toasts.length).toBe(2)
  expect(toasts[0]).toContain('80%')
  expect(toasts[1]).toContain('95%')

  usage.rateLimits = []
  await $.session.measure({ ...usage, changed: ['rateLimits'] })
  expect(await ui.find({ type: 'Text', text: /^96%$/ })).toBeDefined()

  await clock.advance(HOUR)
  await measure(4, NOW + 6 * HOUR)
  await measure(4, NOW + 6 * HOUR)
  expect(toasts.length).toBe(3)
  expect(toasts[2]).toContain('лимит сброшен')
  await ui.unmount()
})

test('session hooks poll Codex and render token share, cache and burn rate', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  let codexWrites = 0
  let cacheWrites = 0
  const store = new Map<string, unknown>([['claude-windows-1', {
    five_hour: { percent: 82, resetsAt: NOW + 30_000, observedAt: NOW - HOUR, notified: 80 },
  }]])
  on('state.set', (_, e, next) => {
    if (e.key === 'codex') codexWrites++
    return next(e)
  })
  on('store.get', (_, e) => ({ value: store.get(e.key) }))
  on('store.set', (_, e) => {
    if (e.key === 'codex-windows-1') cacheWrites++
    store.set(e.key, e.value)
    return { value: undefined }
  })
  mock.env(on, { CODEX_HOME: '/codex-test' })
  let opened = 0
  let listings = 0
  let reads = 0
  let codexTokens = 1000
  let mtimeMs = NOW
  const toasts: string[] = []
  const day = new Date(NOW)
  const dateSuffix = [day.getFullYear(), day.getMonth() + 1, day.getDate()]
    .map(value => String(value).padStart(2, '0')).join('/')
  const file = { name: 'rollout.jsonl', kind: 'file', size: 512, isLink: false } as const

  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.attach', (_, e) => ({ clientId: e.clientId }))
  on('session.surfaces', () => ({ value: ['desktop'] }))
  on('session.usage', () => ({
    value: { startedAt: NOW - HOUR, context: { window: 200_000 }, rateLimits: [] },
  }))
  on('ui.open', () => {
    opened++
    return { value: { isPlaced: true } }
  })
  on('ui.toast', (_, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('fs.list', (_, e) => {
    listings++
    return { value: e.path.replace(/\\/g, '/').endsWith(dateSuffix) ? [{ ...file, mtimeMs }] : [] }
  })
  on('fs.stat', () => ({ value: { ...file, mtimeMs } }))
  on('fs.read', (_, e) => {
    if (e.path.endsWith('auth.json')) return { value: '{}' }
    reads++
    return {
      value: JSON.stringify({
        payload: {
          model: 'codex',
          type: 'token_count',
          info: { total_token_usage: { total_tokens: codexTokens } },
          rate_limits: { primary: { used_percent: 25, resets_at: (NOW + HOUR) / 1000 } },
        },
      }),
    }
  })
  on('turn.complete', (_, e) => ({ text: e.answer, usage: e.usage }))
  on('turn.step', async function* (_, e) {
    return {
      turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn' as const,
      usage: {
        model: 'claude', input_tokens: 500, output_tokens: 1000,
        cache_read_input_tokens: 4000, cache_creation_input_tokens: 500,
      },
    }
  })

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.session.attach({ surface: 'desktop', clientId: 'desktop:test' })
  await clock.advance(0)
  expect(opened).toBe(2)
  expect(listings).toBe(8)
  expect(reads).toBe(1)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /^25%$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^сессия: 100% · 1.0k ток Codex$/ })).toBeDefined()
  expect((await ui.findAll({ type: 'Svg' })).map(({ props }) => props.alt)).toContain('Доля Codex за 7 дней 100%')
  expect(codexWrites).toBe(1)
  expect(cacheWrites).toBe(1)
  await clock.advance(59_999)
  expect(listings).toBe(8)
  await clock.advance(1)
  expect(listings).toBe(16)
  expect(reads).toBe(1)
  expect(toasts.length).toBe(1)
  expect(toasts[0]).toContain('лимит сброшен')
  expect(await ui.find({ type: 'Text', text: /^0%$/ })).toBeDefined()

  mtimeMs = NOW + 60_000
  await clock.advance(60_000)
  expect(reads).toBe(2)
  expect(codexWrites).toBe(1)
  expect(cacheWrites).toBe(1)

  codexTokens = 2000
  mtimeMs = NOW + 120_000
  await clock.advance(60_000)
  expect(reads).toBe(3)
  expect(codexWrites).toBe(2)
  expect(cacheWrites).toBe(1)
  expect(await ui.find({ type: 'Text', text: /^2.0k ток · 1 задача$/ })).toBeDefined()

  for await (const _ of $.turn.step({ turnId: 'turn-1', index: 0, model: 'claude', messageCount: 1 })) void _
  await $.turn.complete({
    turnId: 'turn-1', reason: 'answer', answer: 'Готово', durationMs: 500, isAborted: false,
    usage: {
      model: 'claude', input_tokens: 500, output_tokens: 1000,
      cache_read_input_tokens: 4000, cache_creation_input_tokens: 500,
    },
  })
  expect(await ui.find({ type: 'Text', text: /^сессия: 25% · 2.0k ток Codex$/ })).toBeDefined()
  expect((await ui.findAll({ type: 'Svg' })).map(({ props }) => props.alt)).toContain('Доля Codex за 7 дней 25%')
  const todayKey = dateSuffix.replace(/\//g, '-')
  expect(store.get('claude-days-1')).toEqual({ [todayKey]: 6000 })
  const week = (await ui.findAll({ type: 'Svg' })).find(({ props }) => String(props.alt).startsWith('Токены по дням'))
  expect(week?.props.alt).toContain('6.0k+2.0k')
  expect(await ui.find({ type: 'Text', text: /^кэш 80% · ~100 ток\/мин · 1 ход$/ })).toBeDefined()
  expect(reads).toBe(3)
  expect(await ui.find({ type: 'Svg' })).toBeDefined()
  expect(toasts.length).toBe(1)
  await ui.unmount()
})

test('a narrow pane keeps percents and drops reset times and the model', async ($, on) => {
  mock.clock(on, { now: NOW })
  mock.store(on, {
    'codex-windows-1': {
      fiveHour: { percent: 32, resetsAt: NOW + 2 * HOUR }, week: { percent: 69, resetsAt: NOW + 24 * HOUR },
      model: 'gpt-6.2-sol', plan: 'plus', checkedAt: NOW,
    },
  })
  on('session.usage', () => ({
    value: {
      startedAt: NOW - HOUR, context: { window: 200_000, percent: 10 },
      rateLimits: [{ kind: 'seven_day', percentUsed: 75, resetsAt: new Date(NOW + 13 * HOUR).toISOString() }],
    },
  }))
  const wide = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await wide.find({ type: 'Text', text: /^13ч$/ })).toBeDefined()
  await wide.unmount()
  const narrow = await $.ui.mount({ ...PANE, surface: 'desktop', props: { ...PANE.props, bodyColumns: 26 } })
  for (const value of ['75%', '32%', '69%', '10%']) {
    expect(await narrow.find({ type: 'Text', text: new RegExp(`^${value}$`) })).toBeDefined()
  }
  expect(await narrow.find({ type: 'Text', text: /\d+м$/ })).toBeUndefined()
  expect(await narrow.find({ type: 'Text', text: /gpt-6.2-sol/ })).toBeUndefined()
  await narrow.unmount()
})

test('Codex limits come from the live usage endpoint, and rollouts stand in when it fails', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  mock.store(on, {})
  mock.env(on, { CODEX_HOME: '/codex-live' })
  let up = true
  let fetches = 0
  let sentAuth: string | undefined
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.attach', (_, e) => ({ clientId: e.clientId }))
  on('session.surfaces', () => ({ value: ['desktop'] }))
  on('session.usage', () => ({ value: { startedAt: NOW - HOUR, context: { window: 200_000 }, rateLimits: [] } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.toast', () => ({ value: undefined }))
  const day = new Date(NOW)
  const dateSuffix = [day.getFullYear(), day.getMonth() + 1, day.getDate()]
    .map(value => String(value).padStart(2, '0')).join('/')
  const file = { name: 'rollout.jsonl', kind: 'file', size: 512, isLink: false, mtimeMs: NOW - HOUR } as const
  on('fs.list', (_, e) => ({ value: e.path.replace(/\\/g, '/').endsWith(dateSuffix) ? [file] : [] }))
  on('fs.stat', () => ({ value: file }))
  on('fs.read', (_, e) => e.path.endsWith('auth.json')
    ? { value: JSON.stringify({ tokens: { access_token: 'tok', account_id: 'acc' } }) }
    : {
      value: JSON.stringify({
        payload: {
          type: 'token_count', info: { total_token_usage: { total_tokens: 10 } },
          rate_limits: { primary: { used_percent: 84, resets_at: (NOW + HOUR) / 1000 } },
        },
      }),
    })
  on('http.fetch', (_, e) => {
    fetches++
    sentAuth = e.init?.headers?.Authorization
    if (!up) return { value: { status: 500, ok: false, headers: {}, text: '' } }
    return {
      value: {
        status: 200, ok: true, headers: {},
        text: JSON.stringify({
          plan_type: 'plus',
          rate_limit: {
            primary_window: { used_percent: 12, reset_at: (NOW + 2 * HOUR) / 1000 },
            secondary_window: { used_percent: 17, reset_at: (NOW + 48 * HOUR) / 1000 },
          },
        }),
      },
    }
  })

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.session.attach({ surface: 'desktop', clientId: 'desktop:test' })
  await clock.advance(0)
  expect(fetches).toBe(1)
  expect(sentAuth).toBe('Bearer tok')
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /^12%$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^17%$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^84%$/ })).toBeUndefined()
  await ui.unmount()

  up = false
  await clock.advance(60_000)
  expect(fetches).toBe(2)
  const after = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await after.find({ type: 'Text', text: /^84%$/ })).toBeDefined()
  await after.unmount()
})

test('a fresh window with a few percent used shows no forecast or Codex tip', async ($, on) => {
  mock.clock(on, { now: NOW })
  mock.store(on, {})
  on('session.usage', () => ({
    value: {
      startedAt: NOW - HOUR, context: { window: 200_000, percent: 10 },
      rateLimits: [{ kind: 'five_hour', percentUsed: 4, resetsAt: new Date(NOW + 4.8 * HOUR).toISOString() }],
    },
  }))
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /^4%$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /кончится/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /Отдай следующую задачу/ })).toBeUndefined()
  await ui.unmount()
})

test('the language option switches the pane to English', { options: { language: 'en' } }, async ($, on) => {
  mock.clock(on, { now: NOW })
  mock.store(on, {})
  on('session.usage', () => ({
    value: {
      startedAt: NOW - HOUR, context: { window: 200_000, percent: 10 }, cost: { usd: 2 },
      rateLimits: [
        { kind: 'five_hour', percentUsed: 81, resetsAt: new Date(NOW + 3 * HOUR).toISOString() },
        { kind: 'seven_day', percentUsed: 5, resetsAt: new Date(NOW + 6 * 24 * HOUR + 4 * HOUR).toISOString() },
      ],
    },
  }))
  for (const surface of ['desktop', 'terminal'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    for (const text of [/^5h$/, /^Wk$/, /^Context$/, /^3h$/, /^6d4h$/, /^Codex instead of Claude$/, /^Last hour$/, /^⚠ runs out ~[A-Z][a-z]{2} \d{2}:\d{2}$/]) {
      expect(await ui.find({ type: 'Text', text })).toBeDefined()
    }
    expect(await ui.find({ type: 'Text', text: /[А-Яа-яЁё]/ })).toBeUndefined()
    await ui.unmount()
  }
})
