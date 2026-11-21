import type { ElementTable, RenderChildren } from 'claude-code'

import type { ClaudeTokens, CodexInfo, TurnSample } from '../types'
import { CLAUDE, CODEX, GREEN, HOUR, RED, WINDOWS, YELLOW, pace, percent } from './claude-limits'
import type { DisplayWindow } from './claude-limits'
import { dayKey } from './codex'
import { qty, t } from './i18n'

type Desktop = ElementTable<'desktop'>
export type PaneElements = Pick<Desktop, 'Box' | 'Text' | 'Button'> &
  Partial<Pick<Desktop, 'Svg'>> & { terminal: boolean }

export type Preference = 'collapse-claude' | 'collapse-codex' | 'cost-shawarma'
type Windows = readonly [DisplayWindow | undefined, DisplayWindow | undefined]
type PaneData = {
  now: number
  /** Cells across the pane body; narrow panes drop secondary text. */
  columns?: number
  contextPercent?: number
  costUsd?: number
  tokens: ClaudeTokens
  history: TurnSample[]
  claudeDays?: Record<string, number>
  claude: Windows
  codex: Windows
  codexInfo: CodexInfo
  preferences: Record<Preference, boolean>
  toggle: (preference: Preference) => Promise<void>
}

// The bars are drawn wide and squeezed to the slot (no `width` on the Svg), so
// they shrink with the pane instead of pushing the numbers past its edge.
export const BAR_WIDTH = 480
const BAR_HEIGHT = 8
const CHART_HEIGHT = 44
const NARROW = 34
const DAY = 24 * HOUR
const SPARKS = '▁▂▃▄▅▆▇█'
const pad = (value: number) => String(value).padStart(2, '0')
const fmtNum = (value: number) =>
  value >= 1e6 ? `${(value / 1e6).toFixed(2)}M` : value >= 1e3 ? `${(value / 1e3).toFixed(1)}k` : String(value)
const fmtPercent = (value: number) => `${value.toFixed(0)}%`

function fmtForecast(ms: number) {
  const date = new Date(ms)
  return `${t.weekdays[date.getDay()]} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function fmtReset(window: DisplayWindow, now: number) {
  if (window.expired) return t.reset
  if (window.resetsAt === undefined) return undefined
  const minutes = Math.max(0, Math.ceil((window.resetsAt - now) / 60_000))
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor(minutes / 60) % 24
  // Two units at most, so it always fits beside the bar: 6д4ч, 3ч12м, 12м.
  if (days) return `${days}${t.day}${hours ? `${hours}${t.hour}` : ''}`
  if (hours) return `${hours}${t.hour}${minutes % 60 ? `${minutes % 60}${t.minute}` : ''}`
  return `${minutes}${t.minute}`
}

function card({ Box, terminal }: PaneElements, children: RenderChildren) {
  if (terminal) return <Box flexDirection="column">{children}</Box>
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="promptBorder" padding="xs" gap="xs" minWidth={0}>
      {children}
    </Box>
  )
}

function svg(width: number, height: number, body: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" preserveAspectRatio="none">${body}</svg>`
}

function track(
  { Box, Svg, Text, terminal }: PaneElements, value: number, color: string,
  { marker, rest, alt = fmtPercent(value) }: { marker?: number; rest?: string; alt?: string } = {},
) {
  const fill = percent(value)
  if (terminal || !Svg) {
    const width = 14
    const full = Math.round(fill * width / 100)
    const tick = marker === undefined ? -1 : Math.round(marker * (width - 1) / 100)
    const filled = '█'.repeat(full)
    const empty = (rest ? '█' : '░').repeat(width - full)
    if (tick < 0) return <Text><Text color={color}>{filled}</Text><Text color={rest} dimColor={!rest}>{empty}</Text></Text>
    return (
      <Text>
        <Text color={color}>{filled.slice(0, tick)}</Text>
        <Text dimColor>{empty.slice(0, Math.max(0, tick - full))}</Text>
        <Text dimColor>│</Text>
        <Text color={color}>{filled.slice(tick + 1)}</Text>
        <Text dimColor>{empty.slice(Math.max(0, tick - full + 1))}</Text>
      </Text>
    )
  }

  const trackRect = `<rect y="1" width="${BAR_WIDTH}" height="6" rx="3" fill="${rest ?? '#fff'}" fill-opacity="${rest ? 1 : 0.12}"/>`
  const fillRect = fill > 0 ? `<rect y="1" width="${(BAR_WIDTH * fill / 100).toFixed(2)}" height="6" rx="3" fill="${color}"/>` : ''
  const tickWidth = 3
  const tickX = marker === undefined ? 0 : Math.max(0, Math.min(BAR_WIDTH - tickWidth, BAR_WIDTH * marker / 100 - tickWidth / 2))
  const tickRect = marker === undefined ? '' : `<rect x="${tickX.toFixed(2)}" width="${tickWidth}" height="8" fill="#fff" fill-opacity="0.6"/>`
  return (
    <Box flexGrow={1} flexShrink={1} minWidth={4}>
      <Svg source={svg(BAR_WIDTH, BAR_HEIGHT, trackRect + fillRect + tickRect)} alt={alt} height={BAR_HEIGHT} />
    </Box>
  )
}

/** A label that never shrinks: the numbers stay readable however narrow. */
function fixed({ Box }: PaneElements, child: RenderChildren) {
  return <Box flexShrink={0}>{child}</Box>
}

function limitRow(
  ui: PaneElements, item: typeof WINDOWS[number], window: DisplayWindow | undefined, now: number, narrow: boolean,
) {
  const { Box, Text } = ui
  const shown = window && fmtPercent(window.percent)
  const short = item.text().short
  const forecast = window && pace(window, item.duration, now)
  const reset = window && !narrow ? fmtReset(window, now) : undefined
  const row = (
    <Box flexDirection="row" alignItems="center" gap={ui.terminal ? 1 : 'xs'} minWidth={0}>
      <Box width={3} flexShrink={0}><Text size="caption">{short}</Text></Box>
      {window && forecast ? [
        track(ui, window.percent, forecast.color, { marker: forecast.expected, alt: `${short} ${shown}` }),
        fixed(ui, <Text size="caption" weight="bold" tabular color={forecast.color}>{shown}</Text>),
        reset && fixed(ui, <Text size="caption" dimColor tabular>{reset}</Text>),
      ] : <Text size="caption" dimColor>{t.noData}</Text>}
    </Box>
  )
  return forecast?.hitsAt === undefined ? [row] : [
    row, <Text size="caption" color={forecast.color}>{t.runsOut}{fmtForecast(forecast.hitsAt)}</Text>,
  ]
}

function contextRow(ui: PaneElements, fill: number) {
  const { Box, Text } = ui
  const color = fill > 85 ? RED : fill > 70 ? YELLOW : GREEN
  return (
    <Box flexDirection="row" alignItems="center" gap={ui.terminal ? 1 : 'xs'} minWidth={0}>
      {fixed(ui, <Text size="caption">{t.context}</Text>)}
      {track(ui, fill, color, { alt: `${t.context} ${fmtPercent(fill)}` })}
      {fixed(ui, <Text size="caption" weight="bold" tabular color={color}>{fmtPercent(fill)}</Text>)}
    </Box>
  )
}

function section(
  ui: PaneElements, data: PaneData, name: 'Claude' | 'Codex', windows: Windows,
  details: RenderChildren, right?: RenderChildren, meta?: string,
) {
  const { Box, Button, Text } = ui
  const narrow = (data.columns ?? Infinity) < NARROW
  const preference = name === 'Claude' ? 'collapse-claude' : 'collapse-codex'
  const collapsed = data.preferences[preference]
  const summary = windows.map(window => window ? fmtPercent(window.percent) : '—').join(' · ')
  const heading = (
    <Box flexDirection="row" alignItems="center" justifyContent="space-between" gap={ui.terminal ? 1 : 'xs'} minWidth={0}>
      <Box flexDirection="row" alignItems="center" gap={ui.terminal ? 1 : 'xs'} flexShrink={1} minWidth={0}>
        {fixed(ui, (
          <Button key={preference} plain onPress={() => data.toggle(preference)}>
            <Text color={name === 'Claude' ? CLAUDE : CODEX}>●</Text>
            {' '}<Text weight="semibold">{name}</Text>
          </Button>
        ))}
        {meta && !narrow && (
          <Box flexShrink={1} minWidth={0}>
            <Text size="caption" dimColor wrap="truncate">{meta}</Text>
          </Box>
        )}
      </Box>
      {fixed(ui, collapsed ? <Text size="caption" dimColor tabular>{summary}</Text> : right)}
    </Box>
  )
  if (collapsed) return card(ui, heading)
  return card(ui, [
    heading,
    ...limitRow(ui, WINDOWS[0], windows[0], data.now, narrow),
    ...limitRow(ui, WINDOWS[1], windows[1], data.now, narrow),
    details,
  ])
}

type Day = { key: string; label: string; claude: number; codex: number; today: boolean }

function lastWeek(data: PaneData): Day[] {
  return Array.from({ length: 7 }, (_, index) => {
    const at = data.now - (6 - index) * DAY
    const key = dayKey(at)
    return {
      key,
      label: t.weekdays[new Date(at).getDay()] ?? '',
      claude: data.claudeDays?.[key] ?? 0,
      codex: data.codexInfo.days?.[key] ?? 0,
      today: index === 6,
    }
  })
}

function sparkline(values: number[], max: number) {
  return values.map(value => value <= 0 ? ' ' : SPARKS[Math.min(SPARKS.length - 1, Math.floor(value / max * SPARKS.length))]).join('')
}

/** Columns of stacked bars: Codex at the bottom, Claude on top. */
function columns(ui: PaneElements, stacks: { claude: number; codex: number; strong?: boolean }[], alt: string, height = CHART_HEIGHT) {
  const { Svg, Text, terminal } = ui
  const max = Math.max(1, ...stacks.map(stack => stack.claude + stack.codex))
  if (terminal || !Svg) {
    return [
      <Text color={CLAUDE}>{sparkline(stacks.map(stack => stack.claude), max)}</Text>,
      stacks.some(stack => stack.codex > 0) && <Text color={CODEX}>{sparkline(stacks.map(stack => stack.codex), max)}</Text>,
    ]
  }
  const slot = BAR_WIDTH / stacks.length
  const bar = slot * 0.62
  const body = stacks.map((stack, index) => {
    const x = (index * slot + (slot - bar) / 2).toFixed(2)
    const codex = height * stack.codex / max
    const claude = height * stack.claude / max
    const opacity = stack.strong === false ? 0.55 : 1
    if (codex + claude < 1) {
      return `<rect x="${x}" y="${height - 2}" width="${bar.toFixed(2)}" height="2" fill="#fff" fill-opacity="0.12"/>`
    }
    return [
      codex > 0 && `<rect x="${x}" y="${(height - codex).toFixed(2)}" width="${bar.toFixed(2)}" height="${codex.toFixed(2)}" fill="${CODEX}" fill-opacity="${opacity}"/>`,
      claude > 0 && `<rect x="${x}" y="${(height - codex - claude).toFixed(2)}" width="${bar.toFixed(2)}" height="${claude.toFixed(2)}" fill="${CLAUDE}" fill-opacity="${opacity}"/>`,
    ].filter(Boolean).join('')
  }).join('')
  return <Svg source={svg(BAR_WIDTH, height, body)} alt={alt} height={height} />
}

function weekCard(ui: PaneElements, data: PaneData, days: Day[]) {
  const { Box, Text } = ui
  const claude = days.reduce((sum, day) => sum + day.claude, 0)
  const codex = days.reduce((sum, day) => sum + day.codex, 0)
  const labels = ui.terminal
    ? <Text dimColor>{days.map(day => day.label[0]).join('')}</Text>
    : (
      <Box flexDirection="row" minWidth={0}>
        {days.map(day => (
          <Box key={day.key} width={0} flexGrow={1} alignItems="center" minWidth={0}>
            <Text size="caption" dimColor={!day.today} weight={day.today ? 'semibold' : undefined} wrap="clip">{day.label}</Text>
          </Box>
        ))}
      </Box>
    )
  return card(ui, [
    <Box flexDirection="row" justifyContent="space-between" gap={ui.terminal ? 1 : 'xs'} minWidth={0}>
      {fixed(ui, <Text weight="semibold">{t.sevenDays}</Text>)}
      <Box flexShrink={1} minWidth={0}>
        <Text size="caption" dimColor tabular wrap="truncate">{`${fmtNum(claude + codex)} ${t.tok}`}</Text>
      </Box>
    </Box>,
    columns(ui, days.map(day => ({ claude: day.claude, codex: day.codex, strong: day.today ? true : false })),
      `${t.byDay}: ${days.map(day => `${day.label} ${fmtNum(day.claude)}+${fmtNum(day.codex)}`).join(', ')}`),
    labels,
    <Text size="caption" dimColor tabular wrap="truncate">
      <Text color={CLAUDE}>●</Text>{` Claude ${fmtNum(claude)}  `}<Text color={CODEX}>●</Text>{` Codex ${fmtNum(codex)}`}
    </Text>,
  ])
}

function shareCard(ui: PaneElements, data: PaneData, days: Day[], totalClaude: number) {
  const { Box, Text } = ui
  const { codexInfo } = data
  const weekClaude = days.reduce((sum, day) => sum + day.claude, 0)
  const weekCodex = days.reduce((sum, day) => sum + day.codex, 0)
  const week = weekCodex + weekClaude > 0 ? 100 * weekCodex / (weekCodex + weekClaude) : 0
  const session = codexInfo.sessionTokens > 0 ? 100 * codexInfo.sessionTokens / (totalClaude + codexInfo.sessionTokens) : 0
  const perToken = data.costUsd && totalClaude > 10_000 ? data.costUsd / totalClaude : undefined
  const saved = perToken && weekCodex > 0 ? perToken * weekCodex : undefined
  return card(ui, [
    <Box flexDirection="row" justifyContent="space-between" alignItems="center" gap={ui.terminal ? 1 : 'xs'} minWidth={0}>
      <Box flexShrink={1} minWidth={0}>
        <Text weight="semibold" wrap="truncate">{t.codexInstead}</Text>
      </Box>
      {fixed(ui, <Text size="caption" weight="bold" tabular color={CODEX}>{fmtPercent(week)}</Text>)}
    </Box>,
    <Box flexDirection="row" alignItems="center" gap={ui.terminal ? 1 : 'xs'} minWidth={0}>
      {track(ui, week, CODEX, { rest: CLAUDE, alt: `${t.codexShareAlt} ${fmtPercent(week)}` })}
    </Box>,
    <Text size="caption" dimColor tabular>
      {codexInfo.sessionTokens > 0
        ? t.sessionShare(fmtPercent(session), fmtNum(codexInfo.sessionTokens))
        : t.sessionNoCodex}
    </Text>,
    saved !== undefined && (
      <Text size="caption" dimColor tabular>{t.savedWeek(saved.toFixed(2))}</Text>
    ),
  ])
}

function hourCard(ui: PaneElements, data: PaneData, burn: number) {
  const { Box, Text } = ui
  const buckets = Array.from({ length: 12 }, () => 0)
  for (const turn of data.history) {
    const age = data.now - turn.at
    if (age < 0 || age >= HOUR) continue
    const index = 11 - Math.floor(age / (5 * 60_000))
    buckets[index] = (buckets[index] ?? 0) + turn.tokens
  }
  return card(ui, [
    <Box flexDirection="row" justifyContent="space-between" gap={ui.terminal ? 1 : 'xs'} minWidth={0}>
      {fixed(ui, <Text weight="semibold">{t.lastHour}</Text>)}
      <Box flexShrink={1} minWidth={0}>
        <Text size="caption" dimColor tabular wrap="truncate">{`~${fmtNum(Math.round(burn / 60))} ${t.tokPerMin}`}</Text>
      </Box>
    </Box>,
    columns(ui, buckets.map(claude => ({ claude, codex: 0 })),
      `${t.lastHourAlt}: ${buckets.map(fmtNum).join(', ')}`, 28),
    !ui.terminal && (
      <Box flexDirection="row" justifyContent="space-between" minWidth={0}>
        <Text size="caption" dimColor>{t.minus60}</Text>
        <Text size="caption" dimColor>{t.now}</Text>
      </Box>
    ),
  ])
}

export function drawPane(ui: PaneElements, data: PaneData) {
  const { Box, Button, Text } = ui
  const { tokens, codexInfo, contextPercent, costUsd, history, now } = data
  const input = tokens.input + tokens.cacheRead + tokens.cacheWrite
  const totalClaude = input + tokens.output
  const burn = history.reduce((sum, turn) => turn.at > now - HOUR ? sum + turn.tokens : sum, 0)
  const cost = costUsd === undefined ? undefined : data.preferences['cost-shawarma']
    ? t.shawarma((costUsd / 4).toFixed(2)) : `$${costUsd.toFixed(2)}`
  const tally = cost === undefined ? <Text size="caption" dimColor tabular>{fmtNum(totalClaude)}</Text> : (
    <Button key="cost-shawarma" plain dimColor onPress={() => data.toggle('cost-shawarma')}>
      {`${fmtNum(totalClaude)} · ${cost}`}
    </Button>
  )
  const codexFive = data.codex[0]
  const claudeFive = data.claude[0]
  const recommendCodex = codexFive && !codexFive.expired && codexFive.percent < 50 && claudeFive &&
    (claudeFive.percent >= 70 || pace(claudeFive, WINDOWS[0].duration, now).hitsAt !== undefined)
  const claudeDetails = [
    contextPercent !== undefined && contextRow(ui, contextPercent),
    <Text size="caption" dimColor tabular>
      {input > 0 ? `${t.cache} ${fmtPercent(100 * tokens.cacheRead / input)} · ` : ''}
      {`~${fmtNum(Math.round(burn / 60))} ${t.tokPerMin} · ${qty(tokens.turns, t.turns)}`}
    </Text>,
    recommendCodex && <Text size="caption" weight="semibold">{t.codexHint}</Text>,
  ]
  const codexMeta = [codexInfo.model, codexInfo.plan].filter(Boolean).join(' · ')
  const codexDetails = (
    <Text size="caption" dimColor tabular>
      {`${fmtNum(codexInfo.sessionTokens)} ${t.tok} · ${qty(codexInfo.sessionThreads, t.tasks)}`}
    </Text>
  )
  const days = lastWeek(data)

  return (
    <Box flexDirection="column" gap={ui.terminal ? 1 : 'xs'} minWidth={0}>
      {section(ui, data, 'Claude', data.claude, claudeDetails, tally)}
      {section(ui, data, 'Codex', data.codex, codexDetails, undefined, codexMeta)}
      {shareCard(ui, data, days, totalClaude)}
      {weekCard(ui, data, days)}
      {hourCard(ui, data, burn)}
    </Box>
  )
}
