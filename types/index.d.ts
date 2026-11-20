export type Window = { percent: number; resetsAt?: number }

export type ClaudeTokens = {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  turns: number
}

export type TurnSample = { at: number; tokens: number }

export type ClaudeMeasurement = {
  contextPercent?: number
  costUsd?: number
  fiveHour?: Window
  week?: Window
}

export type CodexInfo = {
  fiveHour?: Window
  week?: Window
  plan?: string
  model?: string
  sessionTokens: number
  sessionThreads: number
  checkedAt: number
  /** Codex tokens per local day (YYYY-MM-DD), last 8 days, by rollout start day. */
  days?: Record<string, number>
}

declare module 'claude-code' {
  interface PluginState {
    limits: {
      claudeTokens: Shaped<ClaudeTokens>
      claudeMeasurement: Shaped<ClaudeMeasurement | null>
      turnHistory: Shaped<TurnSample[]>
      codex: Shaped<CodexInfo>
    }
  }
}
