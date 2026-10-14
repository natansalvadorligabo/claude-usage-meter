export type MetricId = 'context' | 'session' | 'weekly' | 'dailyBudget'
export type ChartStyle = 'none' | 'bar' | 'dots' | 'level' | 'pie'
export type LabelMode = 'always' | 'hover' | 'never'
export type ColorMode = 'on' | 'off'
export type Language = 'en' | 'pt-BR'

export type MetricSettings = {
  isVisible: boolean
  chart: ChartStyle
  showPercent: boolean
  showResetTime: boolean
}

export type UsageMeterConfig = {
  language: Language
  labels: LabelMode
  colors: ColorMode
  countWeekends: boolean
  metrics: Record<MetricId, MetricSettings>
}

export type UsageReading = {
  percent?: number
  resetsAt?: string
}

export type UsageSnapshot = {
  context: UsageReading
  session: UsageReading
  weekly: UsageReading
  limitsMeasuredAt: number
}

export type SharedLimits = {
  measuredAt: number
  session: UsageReading
  weekly: UsageReading
}

export type DayBaseline = {
  day: string
  weeklyPercent: number
  resetsAt?: string
}

declare module 'claude-code' {
  interface PluginState {
    'usage-meter': { config: UsageMeterConfig; usage: UsageSnapshot; baseline: DayBaseline | null }
  }
}
