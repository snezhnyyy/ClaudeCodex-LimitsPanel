# ClaudeCodex-LimitsPanel

A Claude Code mod: a **Лимиты** (Limits) pane beside the chat that shows, at a glance:

- **Claude** — 5-hour and weekly usage limits (percent, bar, time to reset)
- **Claude, this session** — tokens spent (input / output / cache), turns, estimated cost at API prices, context fill
- **Codex** — 5-hour and weekly limits, plan, model, and tokens/tasks Codex spent during this session (read from your local `~/.codex/sessions` logs; refreshes every minute)
- **Codex вместо Claude** — what share of the last 7 days' tokens Codex did instead of Claude, plus this session's share and a rough saving at Claude's price
- **7 дней** — tokens per day, Claude and Codex stacked (Claude days are counted from the moment this version is installed)
- **Последний час** — Claude tokens per 5 minutes

The pane adapts to its width: bars shrink, percentages never get cut; on a very narrow pane reset times and the Codex model name are hidden.

Works great together with the [Codex plugin for Claude Code](https://github.com/openai/codex-plugin-cc). The mod only reads local files and Claude Code's own usage figures; it sends nothing anywhere.

## Install

At the prompt of a terminal Claude Code session:

```
/plugin install limits --marketplace snezhnyyy/ClaudeCodex-LimitsPanel
```

Answer `y` to add the marketplace, then pick a scope (user scope = every session).

From a shell:

```
claude plugin install limits --marketplace snezhnyyy/ClaudeCodex-LimitsPanel
```

In the desktop app, where `/plugin` does not run: click **+** next to the prompt box → **Plugins** → **Add marketplace** with `snezhnyyy/ClaudeCodex-LimitsPanel`, then **Add plugin**.

## Use

The pane opens by itself when a session starts. If you closed it, type `/limits`.

Claude limits appear on a Claude subscription (they come from the API's rate-limit headers). Codex limits appear once Codex has run at least once in the last week. Codex logs are looked up in `$CODEX_HOME/sessions`, or `~/.codex/sessions` by default.
