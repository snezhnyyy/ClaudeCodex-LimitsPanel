# ClaudeCodex-LimitsPanel

**[English](#english) · [Русский](#русский)**

A Claude Code mod: a side pane with your Claude and Codex usage limits, your pace against them, and this session's tokens. The pane comes in **English** or **Russian**; you choose when installing.

Мод для Claude Code: боковая панель с лимитами Claude и Codex, темпом расхода и токенами текущей сессии. Панель бывает на **русском** или **английском**, язык выбирается при установке.

---

## English

### Who it's for

For people who use **Claude Code and Codex together**, most often through OpenAI's [Codex plugin for Claude Code](https://github.com/openai/codex-plugin-cc): Claude plans and reviews, and Codex does the heavy coding. With two subscriptions you have two sets of limits, and it's easy to run out of one while the other sits unused. The pane shows both side by side and how fast you're spending each. It also tells you when to hand the next task to Codex, so Claude's limit lasts longer.

It's useful with Claude alone too: limits, pace and session cost stay in view.

### What it shows

- **Claude**: 5-hour and weekly limits as thin bars with the percent used and the time to reset. Below them: context fill, cache hit rate, tokens per minute, turns, and the session's cost at API prices (click the cost to switch to shawarmas).
- **Codex**: 5-hour and weekly limits (percent used, the same as for Claude), model, plan, and the tokens and tasks Codex ran during this session.
- **Pace marker**: the small tick on each bar marks how much of the window's *time* has passed. If the coloured fill is left of the tick, you are spending slower than time passes and the limit will last. If it is right of the tick, the bar turns yellow or red and a "⚠ runs out ~Sat 15:14" forecast appears.
- **Codex instead of Claude**: the share of the last 7 days' tokens that Codex handled instead of Claude.
- **7 days**: tokens per day, Claude and Codex stacked. **Last hour**: Claude tokens per 5 minutes.
- **Toasts** when a Claude limit passes 80% and 95%, and when it resets.
- Click **Claude** or **Codex** to fold that card into one line.

Limits are remembered between sessions, so the pane shows them right away instead of "no data" until the first reply.

### Install

At the prompt of a terminal Claude Code session:

```
/plugin install limits --marketplace snezhnyyy/ClaudeCodex-LimitsPanel
```

Answer `y` to add the marketplace and pick a scope (user scope = every session). On the options screen, set **Language / Язык** to `en`. The default is `ru`.

From a shell:

```
claude plugin install limits --marketplace snezhnyyy/ClaudeCodex-LimitsPanel
```

In the desktop app: click **+** next to the prompt box → **Plugins** → **Add marketplace** with `snezhnyyy/ClaudeCodex-LimitsPanel`, then **Add plugin**.

To change the language later, use the plugin's row in the config menu, or set it in `~/.claude/settings.json`:

```json
"pluginConfigs": { "limits": { "options": { "language": "en" } } }
```

### Use

The pane opens by itself when a session starts. If you closed it, type `/limits`.

Claude limits appear on a Claude subscription; they come from the API's rate-limit headers. Codex limits appear once Codex has run on this computer.

### Privacy

- Claude figures come from Claude Code itself. Nothing about them leaves your computer.
- Codex token counts are read from your local Codex logs (`$CODEX_HOME/sessions`, or `~/.codex/sessions` by default).
- For up-to-date Codex limits, the mod reads your Codex login token from `~/.codex/auth.json` and sends it to `chatgpt.com/backend-api/wham/usage`, the same OpenAI endpoint the Codex app uses for its usage view. It does this at most once a minute. The token goes to OpenAI only and is never stored or sent anywhere else. If that request fails, the mod falls back to the limits recorded in the local logs.

---

## Русский

### Для кого

Для тех, кто работает с **Claude Code и Codex в связке**, чаще всего через [плагин Codex для Claude Code](https://github.com/openai/codex-plugin-cc) от OpenAI: Claude планирует и проверяет, а Codex пишет основной код. Две подписки означают два набора лимитов, и легко упереться в один, пока второй простаивает. Панель показывает оба рядом и то, как быстро ты тратишь каждый. А ещё подсказывает, когда лучше отдать следующую задачу Codex, чтобы лимит Claude продержался дольше.

Пригодится и тем, у кого только Claude: лимиты, темп и стоимость сессии всегда перед глазами.

### Что показывает

- **Claude**: лимиты на 5 часов и на неделю. Это тонкие полоски с процентом израсходованного и временем до сброса. Под ними: заполненность контекста, процент кэша, токены в минуту, число ходов и стоимость сессии по API-ценам (клик по сумме переключает её в шаурму).
- **Codex**: лимиты на 5 часов и на неделю (сколько израсходовано, как у Claude), модель, тариф, токены и задачи Codex за эту сессию.
- **Чёрточка на полоске**: показывает, какая часть *времени* окна уже прошла. Если цветная заливка левее чёрточки, ты тратишь медленнее, чем идёт время, и лимита хватит. Если правее, полоска желтеет или краснеет и появляется прогноз «⚠ кончится ~Сб 15:14».
- **Codex вместо Claude**: какую долю токенов за последние 7 дней сделал Codex вместо Claude.
- **7 дней**: токены по дням, Claude и Codex столбиками. **Последний час**: токены Claude по 5 минут.
- **Уведомления**, когда лимит Claude переходит 80% и 95% и когда он сбрасывается.
- Клик по **Claude** или **Codex** сворачивает карточку в одну строку.

Лимиты запоминаются между сессиями, поэтому панель показывает их сразу, без «нет данных» до первого ответа.

### Установка

В строке ввода Claude Code в терминале:

```
/plugin install limits --marketplace snezhnyyy/ClaudeCodex-LimitsPanel
```

Ответь `y`, чтобы добавить маркетплейс, и выбери область (user = во всех сессиях). На экране настроек в поле **Language / Язык** оставь `ru` (стоит по умолчанию) или выбери `en`.

Из командной строки:

```
claude plugin install limits --marketplace snezhnyyy/ClaudeCodex-LimitsPanel
```

В десктопном приложении: **+** рядом с полем ввода → **Plugins** → **Add marketplace** с `snezhnyyy/ClaudeCodex-LimitsPanel`, потом **Add plugin**.

Сменить язык потом можно в строке плагина в меню настроек или в `~/.claude/settings.json`:

```json
"pluginConfigs": { "limits": { "options": { "language": "ru" } } }
```

### Использование

Панель открывается сама при старте сессии. Если закрыл, набери `/limits`.

Лимиты Claude видны на подписке Claude: они приходят в заголовках ответов API. Лимиты Codex появятся, когда Codex хоть раз запускался на этом компьютере.

### Приватность

- Данные Claude берутся из самого Claude Code и никуда не уходят.
- Токены Codex считаются по локальным логам Codex (`$CODEX_HOME/sessions`, по умолчанию `~/.codex/sessions`).
- Чтобы лимиты Codex были актуальными, мод читает твой токен входа Codex из `~/.codex/auth.json` и отправляет его на `chatgpt.com/backend-api/wham/usage`. Это тот же адрес OpenAI, к которому обращается само приложение Codex, чтобы показать расход. Запрос идёт не чаще раза в минуту. Токен уходит только в OpenAI, нигде не сохраняется и больше никуда не отправляется. Если запрос не удался, мод берёт лимиты из локальных логов.

---

MIT License: see [LICENSE](LICENSE). / Лицензия MIT: см. [LICENSE](LICENSE).
