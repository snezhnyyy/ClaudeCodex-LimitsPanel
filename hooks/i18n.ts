// Every string the pane, its toasts and its command show, in each language the
// `language` option offers. `register` picks one before any hook runs.

const ru = {
  title: 'Лимиты',
  commandDescription: 'Показать панель лимитов Claude и Codex',
  commandOpened: 'Панель лимитов открыта.',
  weekdays: ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'],
  day: 'д', hour: 'ч', minute: 'м',
  reset: 'сброшен',
  noData: 'нет данных',
  runsOut: '⚠ кончится ~',
  context: 'Контекст',
  fiveHour: { label: '5 часов', short: '5ч' },
  week: { label: 'Неделя', short: 'Нед' },
  tok: 'ток',
  tokPerMin: 'ток/мин',
  cache: 'кэш',
  turns: ['ход', 'хода', 'ходов'] as [string, string, string],
  tasks: ['задача', 'задачи', 'задач'] as [string, string, string],
  shawarma: (n: string) => `≈ ${n} шаурмы`,
  codexHint: '💡 Отдай следующую задачу Codex',
  sevenDays: '7 дней',
  byDay: 'Токены по дням',
  codexInstead: 'Codex вместо Claude',
  codexShareAlt: 'Доля Codex за 7 дней',
  sessionShare: (percent: string, tokens: string) => `сессия: ${percent} · ${tokens} ток Codex`,
  sessionNoCodex: 'сессия: Codex ещё не запускался',
  savedWeek: (usd: string) => `≈ $${usd} за неделю по цене Claude`,
  lastHour: 'Последний час',
  lastHourAlt: 'Токены Claude по 5 минут за последний час',
  minus60: '−60 мин',
  now: 'сейчас',
  toastReset: 'лимит сброшен',
  toastCrossed: (levels: string) => `${levels}% лимита`,
  and: ' и ',
}

export type Strings = typeof ru

const en: Strings = {
  title: 'Limits',
  commandDescription: 'Show the Claude and Codex limits pane',
  commandOpened: 'Limits pane opened.',
  weekdays: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  day: 'd', hour: 'h', minute: 'm',
  reset: 'reset',
  noData: 'no data',
  runsOut: '⚠ runs out ~',
  context: 'Context',
  fiveHour: { label: '5 hours', short: '5h' },
  week: { label: 'Week', short: 'Wk' },
  tok: 'tok',
  tokPerMin: 'tok/min',
  cache: 'cache',
  turns: ['turn', 'turns', 'turns'],
  tasks: ['task', 'tasks', 'tasks'],
  shawarma: (n: string) => `≈ ${n} shawarma`,
  codexHint: '💡 Hand the next task to Codex',
  sevenDays: '7 days',
  byDay: 'Tokens by day',
  codexInstead: 'Codex instead of Claude',
  codexShareAlt: 'Codex share over 7 days',
  sessionShare: (percent: string, tokens: string) => `session: ${percent} · ${tokens} Codex tok`,
  sessionNoCodex: 'session: Codex not used yet',
  savedWeek: (usd: string) => `≈ $${usd} this week at Claude prices`,
  lastHour: 'Last hour',
  lastHourAlt: 'Claude tokens per 5 minutes over the last hour',
  minus60: '−60 min',
  now: 'now',
  toastReset: 'limit reset',
  toastCrossed: (levels: string) => `${levels}% of the limit`,
  and: ' and ',
}

export type Language = 'ru' | 'en'
const TABLES: Record<Language, Strings> = { ru, en }

/** The strings of the language in force; `ru` until `setLanguage` says otherwise. */
export let t: Strings = ru
export let language: Language = 'ru'

export function setLanguage(value: unknown) {
  language = value === 'en' ? 'en' : 'ru'
  t = TABLES[language]
}

/** A count with its noun: Russian picks one of three forms, English one of two. */
export function qty(value: number, [one, few, many]: readonly [string, string, string]) {
  if (language === 'en') return `${value} ${value === 1 ? one : few}`
  const digit = value % 10
  const teens = value % 100 >= 11 && value % 100 <= 14
  return `${value} ${!teens && digit === 1 ? one : !teens && digit >= 2 && digit <= 4 ? few : many}`
}
