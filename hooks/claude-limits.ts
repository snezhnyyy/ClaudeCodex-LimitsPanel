import type { EngineInterface, SessionRateLimit } from 'claude-code'

import type { Window } from '../types'

export const HOUR = 60 * 60 * 1000
export const CLAUDE = '#d97757'
export const CODEX = '#10a37f'
export const GREEN = '#3fb950'
export const YELLOW = '#d29922'
export const RED = '#f85149'

export const WINDOWS = [
  { kind: 'five_hour', label: '5 часов', short: '5ч', duration: 5 * HOUR },
  { kind: 'seven_day', label: 'Неделя', short: 'Нед', duration: 7 * 24 * HOUR },
] as const

type Kind = typeof WINDOWS[number]['kind']
type Snapshot = Window & {
  observedAt: number
  notified: 0 | 80 | 95
  resetNotified?: true
}
export type Snapshots = Partial<Record<Kind, Snapshot>>
export type DisplayWindow = Window & { expired?: boolean }

export const percent = (value: number) => Math.max(0, Math.min(value, 100))

export function sameWindow(a: Window | undefined, b: Window | undefined) {
  return a?.percent === b?.percent && a?.resetsAt === b?.resetsAt
}

const STORE_KEY = 'claude-windows-1'
const RESET_DROP = 25

export async function readSnapshots($: EngineInterface): Promise<Snapshots> {
  return (await $.store.get(STORE_KEY) as Snapshots | undefined) ?? {}
}

export function liveWindow(limits: SessionRateLimit[], kind: Kind): Window | undefined {
  const limit = limits.find(item => item.kind === kind)
  if (!limit || !Number.isFinite(limit.percentUsed)) return undefined
  const resetsAt = Date.parse(limit.resetsAt ?? '')
  return {
    percent: percent(limit.percentUsed),
    resetsAt: Number.isFinite(resetsAt) ? resetsAt : undefined,
  }
}

function expired(window: Window | undefined, now: number): boolean {
  return window?.resetsAt !== undefined && window.resetsAt <= now
}

export function claudeWindow(
  live: Window | undefined, stored: Snapshots, kind: Kind, now: number,
): DisplayWindow | undefined {
  if (live && !expired(live, now)) return live
  const window = stored[kind] ?? live
  if (expired(window, now)) return { ...window, percent: 0, expired: true }
  return window
}

export function codexWindow(window: Window | undefined, now: number): DisplayWindow | undefined {
  return expired(window, now) ? { ...window, percent: 0, expired: true } : window
}

export function pace(window: DisplayWindow, duration: number, now: number) {
  if (window.expired || window.resetsAt === undefined) return { color: GREEN }
  const elapsedMs = Math.max(0, Math.min(duration, now - (window.resetsAt - duration)))
  const expected = 100 * elapsedMs / duration
  const hitsAt = window.percent >= 100 ? now
    : expected > 0 && window.percent > expected
      ? now + elapsedMs * (100 - window.percent) / window.percent
      : undefined
  const lead = hitsAt === undefined ? 0 : window.resetsAt - hitsAt
  // An early finish within 5% of the window is a warning with a small lead.
  const color = window.percent >= 100 || lead >= duration * 0.05 ? RED
    : lead > 0 ? YELLOW : GREEN
  return { expected, hitsAt, color }
}

async function saveSnapshots($: EngineInterface, now: number, limits: SessionRateLimit[]) {
  const previous = await readSnapshots($)
  const updated = { ...previous }
  const messages: string[] = []
  let changed = false

  for (const { kind, label } of WINDOWS) {
    const old = previous[kind]
    const reported = liveWindow(limits, kind)
    // A session can keep reporting its last response after that window ended.
    const live = expired(reported, now) ? undefined : reported
    if (old && now < old.observedAt) continue
    if (old?.resetsAt !== undefined && live?.resetsAt !== undefined && live.resetsAt < old.resetsAt) {
      continue
    }

    const resetByTime = expired(old, now)
    const resetByDrop = old !== undefined && live !== undefined && old.percent - live.percent >= RESET_DROP
    const reset = resetByTime || resetByDrop
    if (reset && !old?.resetNotified) messages.push(`Claude · ${label}: лимит сброшен`)

    if (!live) {
      if (old && resetByTime && !old.resetNotified) {
        updated[kind] = { ...old, resetNotified: true }
        changed = true
      }
      continue
    }
    if (!reset && sameWindow(old, live)) continue

    const notified = reset ? 0 : old?.notified ?? 0
    const before = reset ? 0 : old?.percent ?? 0
    const crossed = ([80, 95] as const).filter(level =>
      level > notified && before < level && live.percent >= level,
    )
    if (crossed.length) messages.push(`Claude · ${label}: ${crossed.join(' и ')}% лимита`)
    updated[kind] = { ...live, observedAt: now, notified: crossed.at(-1) ?? notified }
    changed = true
  }

  if (changed) await $.store.set(STORE_KEY, updated)
  if (messages.length) await $.ui.toast(messages.join(' · '))
}

// Measurements and the clock can overlap. Read the store in order before
// recording a notification so two callbacks cannot send it for the same window.
let pending = Promise.resolve()

export function observeClaudeLimits($: EngineInterface, now: number, limits: SessionRateLimit[] = []) {
  const saved = pending.then(() => saveSnapshots($, now, limits))
  pending = saved.catch(() => {})
  return saved
}
