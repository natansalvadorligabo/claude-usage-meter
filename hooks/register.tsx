import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderChildren, SessionContextUsage, SessionRateLimit, TextHoverProps } from 'claude-code'

import type {
  ChartStyle,
  ColorMode,
  DayBaseline,
  LabelMode,
  Language,
  MetricId,
  MetricSettings,
  SharedLimits,
  UsageMeterConfig,
  UsageReading,
  UsageSnapshot,
} from '../types'

const PANE = 'usage-meter-settings'
const SETTINGS_KEY = 'settings.v2'
const BASELINE_KEY = 'dayBaseline'
const SHARED_LIMITS_FILE = 'usage-meter/latest-limits.json'
// Every terminal reports the account's limits only after its own responses, so the newest reading is passed through a local file.
const SHARED_LIMITS_SYNC_MS = 10_000
const SEPARATOR = ' · '
const BAR_WIDTH = 8
const DAY_MS = 24 * 60 * 60 * 1000
const GREEN = '#22c55e'
const LIME = '#a3e635'
const YELLOW = '#facc15'
const ORANGE = '#fb923c'
const RED = '#ef4444'
const LIMIT_COLOR_STOPS: [number, string][] = [[0, GREEN], [25, LIME], [50, YELLOW], [65, ORANGE], [80, RED]]
// The context is usually swapped or compacted between 50% and 60%, so its scale turns orange at 50%.
const CONTEXT_COLOR_STOPS: [number, string][] = [[0, GREEN], [30, LIME], [40, YELLOW], [50, ORANGE], [65, RED]]
// Pace colors stay outside the green-to-red usage scale so the daily tip is never read as a usage level.
const PACE_STYLES = {
  onTrack: { icon: '✓', color: '#38bdf8' },
  close: { icon: '◐', color: '#c084fc' },
  over: { icon: '✗', color: '#f472b6' },
} as const
const CLOSE_TO_BUDGET_RATIO = 0.8
const UNCOLORED_BLOCK = '#d4d4d4'
// Windows Terminal's Campbell scheme: a hover background in it keeps the Button's pointer inversion from showing.
const TERMINAL_BACKGROUND = '#0c0c0c'
const HOVER_LABEL = '#8a8a8a'
const HOVER_SCOPE = 'usage-meter-section'
const LEVEL_GLYPHS = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█']
const PIE_GLYPHS = ['○', '◔', '◑', '◕', '●']
const METRIC_ORDER: MetricId[] = ['context', 'session', 'weekly', 'dailyBudget']
const METRICS_WITH_RESET_TIME: MetricId[] = ['session', 'weekly']
const CHART_STYLES: ChartStyle[] = ['none', 'bar', 'dots', 'level', 'pie']
const LABEL_MODES: LabelMode[] = ['always', 'hover', 'never']
const COLOR_MODES: ColorMode[] = ['on', 'off']
const LANGUAGES: Language[] = ['en', 'pt-BR']
const SATURDAY = 6
const SUNDAY = 0

type Messages = {
  title: string
  general: string
  weekdays: string[]
  metricLabels: Record<MetricId, string>
  metricNames: Record<MetricId, string>
  rows: { language: string; chart: string; percent: string; resetTime: string; labels: string; colors: string; weekends: string }
  charts: Record<ChartStyle, string>
  labelModes: Record<LabelMode, string>
  colorModes: Record<ColorMode, string>
  languages: Record<Language, string>
  visible: string
  hidden: string
  on: string
  off: string
  countWeekends: string
  skipWeekends: string
  done: string
  restoreDefaults: string
  commandDescription: string
  commandOpened: string
}

const MESSAGES: Record<Language, Messages> = {
  en: {
    title: 'Usage meter',
    general: 'General',
    weekdays: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    metricLabels: { context: 'Context:', session: 'Session:', weekly: 'Weekly:', dailyBudget: 'Daily budget:' },
    metricNames: { context: 'Context', session: 'Session', weekly: 'Weekly', dailyBudget: 'Daily budget' },
    rows: { language: 'Language', chart: 'Chart', percent: 'Percent', resetTime: 'Reset time', labels: 'Labels', colors: 'Colors', weekends: 'Weekends' },
    charts: { none: 'Number', bar: 'Bar', dots: 'Dots', level: 'Level', pie: 'Pie' },
    labelModes: { always: 'Show', hover: 'On hover', never: 'Hide' },
    colorModes: { on: 'On', off: 'Off' },
    languages: { en: 'English', 'pt-BR': 'Português' },
    visible: '✓ Visible',
    hidden: '○ Hidden',
    on: 'On',
    off: 'Off',
    countWeekends: 'Count Sat and Sun',
    skipWeekends: 'Skip Sat and Sun',
    done: 'Done',
    restoreDefaults: 'Restore defaults',
    commandDescription: 'Open the usage meter settings',
    commandOpened: 'Usage meter settings opened.',
  },
  'pt-BR': {
    title: 'Medidor de uso',
    general: 'Geral',
    weekdays: ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'],
    metricLabels: { context: 'Contexto:', session: 'Sessão:', weekly: 'Semanal:', dailyBudget: 'Meta diária:' },
    metricNames: { context: 'Contexto', session: 'Sessão', weekly: 'Semanal', dailyBudget: 'Meta diária' },
    rows: { language: 'Idioma', chart: 'Gráfico', percent: 'Percentual', resetTime: 'Horário de reset', labels: 'Rótulos', colors: 'Cores', weekends: 'Fins de semana' },
    charts: { none: 'Número', bar: 'Barra', dots: 'Pontos', level: 'Nível', pie: 'Pizza' },
    labelModes: { always: 'Mostrar', hover: 'Ao passar o mouse', never: 'Ocultar' },
    colorModes: { on: 'Ligadas', off: 'Desligadas' },
    languages: { en: 'English', 'pt-BR': 'Português' },
    visible: '✓ Visível',
    hidden: '○ Oculto',
    on: 'Ligado',
    off: 'Desligado',
    countWeekends: 'Contar sáb e dom',
    skipWeekends: 'Ignorar sáb e dom',
    done: 'Concluir',
    restoreDefaults: 'Restaurar padrão',
    commandDescription: 'Abre as configurações do medidor de uso',
    commandOpened: 'Configurações do medidor de uso abertas.',
  },
}

const DEFAULT_METRIC: MetricSettings = { isVisible: true, chart: 'none', showPercent: true, showResetTime: true }

const DEFAULT_CONFIG: UsageMeterConfig = {
  language: 'en',
  labels: 'never',
  colors: 'on',
  countWeekends: true,
  metrics: {
    context: DEFAULT_METRIC,
    session: DEFAULT_METRIC,
    weekly: DEFAULT_METRIC,
    dailyBudget: DEFAULT_METRIC,
  },
}

const EMPTY_USAGE: UsageSnapshot = { context: {}, session: {}, weekly: {}, limitsMeasuredAt: 0 }

const config = atom({ plugin: 'usage-meter', key: 'config' } as const, DEFAULT_CONFIG)
const usage = atom({ plugin: 'usage-meter', key: 'usage' } as const, EMPTY_USAGE)
const baseline = atom({ plugin: 'usage-meter', key: 'baseline' } as const, null)

type Segment = { text: string; color?: string; isDim?: boolean }
type SegmentRun = { key: string; segments: Segment[]; isHiddenUntilHover?: boolean }
type LineItem = { id: MetricId; label: string; segments: Segment[] }

function withKnownChart(metric: MetricSettings): MetricSettings {
  const chart = (metric.chart as string) === 'smooth' ? 'bar' : metric.chart
  return { ...metric, chart: CHART_STYLES.includes(chart) ? chart : DEFAULT_METRIC.chart }
}

function mergeWithDefaults(stored: unknown): UsageMeterConfig {
  if (!stored || typeof stored !== 'object') return DEFAULT_CONFIG
  const partial = stored as Partial<UsageMeterConfig>
  const storedMetrics: Partial<Record<MetricId, Partial<MetricSettings>>> = partial.metrics ?? {}
  const metrics = Object.fromEntries(
    METRIC_ORDER.map(id => [id, withKnownChart({ ...DEFAULT_METRIC, ...storedMetrics[id] })]),
  ) as Record<MetricId, MetricSettings>
  const labels = LABEL_MODES.includes(partial.labels as LabelMode) ? partial.labels as LabelMode : DEFAULT_CONFIG.labels
  const colors: ColorMode = partial.colors === 'off' ? 'off' : 'on'
  return { ...DEFAULT_CONFIG, ...partial, labels, colors, metrics }
}

function toSnapshot(context: SessionContextUsage, rateLimits: SessionRateLimit[], limitsMeasuredAt: number): UsageSnapshot {
  const readLimit = (kind: string): UsageReading => {
    const limit = rateLimits.find(one => one.kind === kind)
    return limit ? { percent: limit.percentUsed, resetsAt: limit.resetsAt } : {}
  }
  return {
    context: { percent: context.percent },
    session: readLimit('five_hour'),
    weekly: readLimit('seven_day'),
    limitsMeasuredAt,
  }
}

async function sharedLimitsPath($: EngineInterface): Promise<string | undefined> {
  const configDir = await $.env.get('CLAUDE_CONFIG_DIR')
  if (configDir) return `${configDir}/${SHARED_LIMITS_FILE}`
  const home = (await $.env.get('HOME')) ?? (await $.env.get('USERPROFILE'))
  return home ? `${home}/.claude/${SHARED_LIMITS_FILE}` : undefined
}

// Several terminals write this file: a writer never replaces a newer reading, and a torn or half-written file reads as absent.
async function publishLimits($: EngineInterface, snapshot: UsageSnapshot) {
  const path = await sharedLimitsPath($)
  if (!path) return
  const published = await readSharedLimits($)
  if (published && published.measuredAt >= snapshot.limitsMeasuredAt) return
  const shared: SharedLimits = { measuredAt: snapshot.limitsMeasuredAt, session: snapshot.session, weekly: snapshot.weekly }
  await $.fs.write(path, JSON.stringify(shared)).catch(() => undefined)
}

async function readSharedLimits($: EngineInterface): Promise<SharedLimits | undefined> {
  const path = await sharedLimitsPath($)
  if (!path) return undefined
  try {
    const shared = JSON.parse(String(await $.fs.read(path))) as Partial<SharedLimits>
    if (typeof shared.measuredAt !== 'number') return undefined
    return { measuredAt: shared.measuredAt, session: shared.session ?? {}, weekly: shared.weekly ?? {} }
  } catch {
    return undefined
  }
}

function withoutExpiredReset(reading: UsageReading, now: number): UsageReading {
  return reading.resetsAt && Date.parse(reading.resetsAt) <= now ? {} : reading
}

async function adoptSharedLimits($: EngineInterface) {
  const shared = await readSharedLimits($)
  if (!shared) return
  const now = await $.clock.now()
  await recordUsage($, current => shared.measuredAt <= current.limitsMeasuredAt ? current : {
    ...current,
    session: withoutExpiredReset(shared.session, now),
    weekly: withoutExpiredReset(shared.weekly, now),
    limitsMeasuredAt: shared.measuredAt,
  })
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function localDayKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function isWeekend(date: Date): boolean {
  return date.getDay() === SATURDAY || date.getDay() === SUNDAY
}

function nextBaseline(current: DayBaseline | null, weekly: UsageReading, now: Date): DayBaseline | null {
  if (typeof weekly.percent !== 'number') return current
  const isStale = !current
    || current.day !== localDayKey(now)
    || current.resetsAt !== weekly.resetsAt
    || weekly.percent < current.weeklyPercent
  return isStale ? { day: localDayKey(now), weeklyPercent: weekly.percent, resetsAt: weekly.resetsAt } : current
}

// Today always counts, even on a weekend: the person is spending right now.
function budgetDaysUntilReset(resetsAt: string, now: Date, countWeekends: boolean): number {
  const reset = new Date(resetsAt)
  if (Number.isNaN(reset.getTime())) return 1
  const lastDay = startOfLocalDay(reset).getTime()
  let days = 0
  for (let day = startOfLocalDay(now); day.getTime() <= lastDay; day = new Date(day.getTime() + DAY_MS)) {
    const isToday = localDayKey(day) === localDayKey(now)
    if (isToday || countWeekends || !isWeekend(day)) days += 1
  }
  return Math.max(1, days)
}

function buildDailyBudgetSegments(weekly: UsageReading, dayBaseline: DayBaseline | null, settings: UsageMeterConfig, now: Date): Segment[] {
  if (typeof weekly.percent !== 'number' || !weekly.resetsAt || !dayBaseline) return []
  const days = budgetDaysUntilReset(weekly.resetsAt, now, settings.countWeekends)
  const budget = Math.max(0, (100 - dayBaseline.weeklyPercent) / days)
  const spentToday = Math.max(0, weekly.percent - dayBaseline.weeklyPercent)
  const pace = spentToday > budget ? PACE_STYLES.over : spentToday > budget * CLOSE_TO_BUDGET_RATIO ? PACE_STYLES.close : PACE_STYLES.onTrack
  const paceColor = settings.colors === 'off' ? undefined : pace.color
  return [
    { text: `${pace.icon} `, color: paceColor },
    { text: `${Math.round(spentToday)}%/${Math.round(budget)}%`, color: paceColor },
  ]
}

function pickStepColor(percent: number, colorStops: [number, string][]): string {
  let color = colorStops[0]?.[1] ?? GREEN
  for (const [stop, hex] of colorStops) {
    if (stop <= percent) color = hex
  }
  return color
}

function colorFor(id: MetricId, percent: number, mode: ColorMode): string | undefined {
  if (mode === 'off') return undefined
  return pickStepColor(percent, id === 'context' ? CONTEXT_COLOR_STOPS : LIMIT_COLOR_STOPS)
}

function renderChart(percent: number, chart: ChartStyle): { filled: string; empty: string } {
  const bounded = Math.min(Math.max(percent, 0), 100)
  const filledCells = Math.round((bounded / 100) * BAR_WIDTH)
  switch (chart) {
    case 'dots':
      return { filled: '●'.repeat(filledCells), empty: '○'.repeat(BAR_WIDTH - filledCells) }
    case 'bar':
      return { filled: '█'.repeat(filledCells), empty: '░'.repeat(BAR_WIDTH - filledCells) }
    case 'level':
      return { filled: LEVEL_GLYPHS[Math.min(7, Math.floor(bounded / 12.5))] ?? '', empty: '' }
    case 'pie':
      return { filled: PIE_GLYPHS[Math.round(bounded / 25)] ?? '', empty: '' }
    default:
      return { filled: '', empty: '' }
  }
}

function formatResetTime(id: MetricId, resetsAt: string, messages: Messages): string {
  const date = new Date(resetsAt)
  if (Number.isNaN(date.getTime())) return ''
  return id === 'weekly'
    ? `${messages.weekdays[date.getDay()]} ${pad(date.getHours())}h`
    : `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function buildUsageSegments(id: MetricId, reading: UsageReading, settings: UsageMeterConfig): Segment[] {
  const { percent, resetsAt } = reading
  if (typeof percent !== 'number') return []
  const metric = settings.metrics[id]
  const color = colorFor(id, percent, settings.colors)
  const { filled, empty } = renderChart(percent, metric.chart)
  const hasChart = filled.length + empty.length > 0
  const segments: Segment[] = []
  const solidBlocks = filled.match(/^█*/)?.[0] ?? ''
  if (solidBlocks) segments.push({ text: solidBlocks, color: color ?? UNCOLORED_BLOCK })
  if (filled.length > solidBlocks.length) segments.push({ text: filled.slice(solidBlocks.length), color })
  if (empty) segments.push({ text: empty, isDim: true })
  if (metric.showPercent || !hasChart) segments.push({ text: `${hasChart ? ' ' : ''}${Math.round(percent)}%`, color })
  const resetTime = metric.showResetTime && resetsAt ? formatResetTime(id, resetsAt, MESSAGES[settings.language]) : ''
  if (resetTime) segments.push({ text: ` ↻ ${resetTime}`, isDim: true })
  return segments
}

function describeUsageLine(settings: UsageMeterConfig, snapshot: UsageSnapshot, dayBaseline: DayBaseline | null): LineItem[] {
  const now = new Date()
  return METRIC_ORDER
    .filter(id => settings.metrics[id].isVisible)
    .map(id => ({
      id,
      label: MESSAGES[settings.language].metricLabels[id],
      segments: id === 'dailyBudget'
        ? buildDailyBudgetSegments(snapshot.weekly, dayBaseline, settings, now)
        : buildUsageSegments(id, snapshot[id], settings),
    }))
    .filter(item => item.segments.length > 0)
}

const EMPHASIS_HOVER: TextHoverProps = { bold: true, dimColor: false, inverse: false, backgroundColor: TERMINAL_BACKGROUND, scope: HOVER_SCOPE }
const BUTTON_HOVER: TextHoverProps = { inverse: false, backgroundColor: TERMINAL_BACKGROUND, scope: HOVER_SCOPE }

function lineRuns(items: LineItem[], labels: LabelMode): SegmentRun[] {
  return items.flatMap((item, index): SegmentRun[] => {
    const separator: Segment[] = index > 0 ? [{ text: SEPARATOR, isDim: true }] : []
    if (labels !== 'hover') {
      const label: Segment[] = labels === 'always' ? [{ text: `${item.label} `, isDim: true }] : []
      return [{ key: item.id, segments: [...separator, ...label, ...item.segments] }]
    }
    return [
      ...(separator.length > 0 ? [{ key: `${item.id}-separator`, segments: separator }] : []),
      { key: `${item.id}-label`, segments: [{ text: `${item.label} `, color: HOVER_LABEL }], isHiddenUntilHover: true },
      { key: item.id, segments: item.segments },
    ]
  })
}

function withMetric(current: UsageMeterConfig, id: MetricId, change: Partial<MetricSettings>): UsageMeterConfig {
  const changed = { ...current, metrics: { ...current.metrics, [id]: { ...current.metrics[id], ...change } } }
  const hasVisibleMetric = METRIC_ORDER.some(one => changed.metrics[one].isVisible)
  return hasVisibleMetric ? changed : current
}

async function changeConfig($: EngineInterface, change: (current: UsageMeterConfig) => UsageMeterConfig) {
  await update($, config, current => change(current ?? DEFAULT_CONFIG))
  await $.store.set(SETTINGS_KEY, await read($, config))
}

async function recordUsage($: EngineInterface, change: (current: UsageSnapshot) => UsageSnapshot) {
  const snapshot = await update($, usage, change)
  const stored = (await $.store.get(BASELINE_KEY)) as DayBaseline | undefined
  const updated = nextBaseline(stored ?? null, snapshot.weekly, new Date())
  await update($, baseline, () => updated)
  if (updated && updated !== stored) await $.store.set(BASELINE_KEY, updated)
}

async function openSettings($: EngineInterface) {
  const { language } = await read($, config)
  await $.ui.open({ id: PANE, title: MESSAGES[language].title, focus: true, closeOnEscape: true })
}

export const register: Register = on => {
  let publishing: Promise<void> = Promise.resolve()

  on('session.start', async ($, e, next) => {
    await update($, config, () => DEFAULT_CONFIG)
    const settings = mergeWithDefaults(await $.store.get(SETTINGS_KEY))
    await update($, config, () => settings)
    const current = await $.session.usage()
    await recordUsage($, () => toSnapshot(current.context, current.rateLimits, 0))
    await adoptSharedLimits($)
    $.clock.every(SHARED_LIMITS_SYNC_MS, () => void adoptSharedLimits($))
    await $.command.register({ name: 'usage-meter', description: MESSAGES[settings.language].commandDescription })
    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    if (!e.changed.includes('rateLimits') || e.rateLimits.length === 0) {
      await recordUsage($, current => ({ ...current, context: { percent: e.context.percent } }))
      return next(e)
    }
    const snapshot = toSnapshot(e.context, e.rateLimits, await $.clock.now())
    await recordUsage($, () => snapshot)
    publishing = publishing.then(() => publishLimits($, snapshot)).catch(() => undefined)
    await publishing
    return next(e)
  })

  on('command.run', { command: 'usage-meter' }, async $ => {
    await openSettings($)
    return { text: MESSAGES[(await read($, config)).language].commandOpened }
  })

  on('ui.render', { component: 'SessionMode' }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const settings = await read($, config)
    const items = describeUsageLine(settings, await read($, usage), await read($, baseline))
    const modes = e.props.modes.length > 0 && <Text dimColor>{e.props.modes.join(' & ')}{SEPARATOR}</Text>
    const drawSegment = (segment: Segment) => (
      <Text color={segment.color} dimColor={segment.isDim} hover={EMPHASIS_HOVER}>
        {segment.text}
      </Text>
    )
    const drawRun = (run: SegmentRun) => {
      const button = (
        <Button key={`open-settings-${run.key}`} plain hover={BUTTON_HOVER} onPress={() => void openSettings($)}>
          {run.segments.map(drawSegment)}
        </Button>
      )
      return run.isHiddenUntilHover ? <Box display="none" hover={{ display: 'flex', scope: HOVER_SCOPE }}>{button}</Box> : button
    }

    return (
      <Box>
        {modes}
        {/* Texts nested in a Button label cannot heat their hover group, so the Box joins it and heats it for them. */}
        <Box key={HOVER_SCOPE} hover={{ scope: HOVER_SCOPE }}>
          {lineRuns(items, settings.labels).map(drawRun)}
        </Box>
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const settings = await read($, config)
    const messages = MESSAGES[settings.language]
    const setGeneral = (change: Partial<UsageMeterConfig>) => () => changeConfig($, current => ({ ...current, ...change }))
    const setMetric = (id: MetricId, change: Partial<MetricSettings>) => () => changeConfig($, current => withMetric(current, id, change))

    const choice = (key: string, label: string, isSelected: boolean, onPress: () => void) => (
      <Button key={key} label={label} variant={isSelected ? 'primary' : undefined} dimColor={!isSelected} onPress={onPress} />
    )

    const row = (title: string, controls: RenderChildren[]) => (
      <Box columnGap={1}>
        <Box width={18} flexShrink={0}>
          <Text dimColor>{title}</Text>
        </Box>
        <Box flexWrap="wrap" columnGap={1}>{controls}</Box>
      </Box>
    )

    const section = (title: string, rows: RenderChildren[], headerControl?: RenderChildren) => (
      <Box flexDirection="column">
        <Box columnGap={1}>
          <Box width={18} flexShrink={0}>
            <Text weight="bold">{title}</Text>
          </Box>
          {headerControl}
        </Box>
        {rows}
      </Box>
    )

    const switchRow = (key: string, title: string, isOn: boolean, onChange: (value: boolean) => () => void) =>
      row(title, [true, false].map(value => choice(`${key}-${value}`, value ? messages.on : messages.off, isOn === value, onChange(value))))

    const metricSection = (id: MetricId) => {
      const metric = settings.metrics[id]
      const visibility = choice(`${id}-visible`, metric.isVisible ? messages.visible : messages.hidden, metric.isVisible, setMetric(id, { isVisible: !metric.isVisible }))
      if (!metric.isVisible) return section(messages.metricNames[id], [], visibility)
      if (id === 'dailyBudget') {
        return section(messages.metricNames[id], [
          row(messages.rows.weekends, [
            choice('weekends-true', messages.countWeekends, settings.countWeekends, setGeneral({ countWeekends: true })),
            choice('weekends-false', messages.skipWeekends, !settings.countWeekends, setGeneral({ countWeekends: false })),
          ]),
        ], visibility)
      }
      return section(messages.metricNames[id], [
        row(messages.rows.chart, CHART_STYLES.map(chart =>
          choice(`${id}-chart-${chart}`, messages.charts[chart], metric.chart === chart, setMetric(id, { chart })))),
        switchRow(`${id}-percent`, messages.rows.percent, metric.showPercent, showPercent => setMetric(id, { showPercent })),
        ...(METRICS_WITH_RESET_TIME.includes(id)
          ? [switchRow(`${id}-reset`, messages.rows.resetTime, metric.showResetTime, showResetTime => setMetric(id, { showResetTime }))]
          : []),
      ], visibility)
    }

    return (
      <Box flexDirection="column" borderStyle="round" paddingX={1} rowGap={1}>
        <Text weight="bold">{messages.title}</Text>
        {section(messages.general, [
          row(messages.rows.language, LANGUAGES.map(language =>
            choice(`language-${language}`, messages.languages[language], settings.language === language, setGeneral({ language })))),
          row(messages.rows.labels, LABEL_MODES.map(labels =>
            choice(`labels-${labels}`, messages.labelModes[labels], settings.labels === labels, setGeneral({ labels })))),
          row(messages.rows.colors, COLOR_MODES.map(colors =>
            choice(`colors-${colors}`, messages.colorModes[colors], settings.colors === colors, setGeneral({ colors })))),
        ])}
        {METRIC_ORDER.map(metricSection)}
        <Box columnGap={1}>
          <Button key="close" variant="primary" role="dismiss" label={messages.done} onPress={() => void $.ui.close({ id: PANE })} />
          <Button key="restore" dimColor label={messages.restoreDefaults} onPress={() => changeConfig($, current => ({ ...DEFAULT_CONFIG, language: current.language }))} />
        </Box>
      </Box>
    )
  })
}
