export type Window = { percent: number; resetsAt?: number }

export type ClaudeTokens = {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  turns: number
}

export type CodexInfo = {
  fiveHour?: Window
  week?: Window
  plan?: string
  model?: string
  sessionTokens: number
  sessionThreads: number
  checkedAt: number
}

declare module 'claude-code' {
  interface PluginState {
    limits: {
      claudeTokens: Shaped<ClaudeTokens>
      codex: Shaped<CodexInfo>
    }
  }
}
