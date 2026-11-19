# ClaudeCodex-LimitsPanel

A Claude Code mod: a **Лимиты** (Limits) pane beside the chat that shows, at a glance:

- **Claude** — 5-hour and weekly usage limits (percent, bar, time to reset)
- **Claude, this session** — tokens spent (input / output / cache), turns, estimated cost at API prices, context fill
- **Codex** — 5-hour and weekly limits, plan, model, and tokens/tasks Codex spent during this session (read from your local `~/.codex/sessions` logs; refreshes every 30 s)

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
