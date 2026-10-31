import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On, SessionMessage } from 'claude-code'

const SURFACES = ['terminal', 'desktop'] as const
const PANE_ID = 'usage-meter-settings'
const PANE_PROPS = {
  title: 'Usage meter',
  isFocused: true,
  bodyColumns: 90,
  placement: 'dock',
  scroll: { offset: 0, bodyRows: 40 },
  view: {},
} as const

const HOUR_MS = 60 * 60 * 1000

function inCalendarDays(days: number): string {
  const date = new Date()
  date.setDate(date.getDate() + days)
  date.setHours(12, 0, 0, 0)
  return date.toISOString()
}

function answerEngine(on: On, opened: string[] = []) {
  const store = new Map<string, unknown>()
  const files = new Map<string, string>()
  const clock = mock.clock(on, { now: Date.now() })
  on('env.get', (_, e) => ({ value: e.name === 'HOME' ? '/home/tester' : undefined }))
  on('fs.read', (_, e) => ({ value: files.get(e.path) ?? '' }))
  on('fs.write', (_, e) => {
    files.set(e.path, e.text)
    return { value: undefined }
  })
  on('session.usage', () => ({ value: { context: { window: 200000, tokens: 84000, percent: 42 }, rateLimits: [], startedAt: Date.now() } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('session.measure', (_, e) => ({ changed: e.changed }))
  on('ui.open', (_, e) => {
    opened.push(e.id)
    return { value: { isPlaced: true } }
  })
  on('store.get', (_, e) => ({ value: store.get(e.key) }))
  on('store.set', (_, e) => {
    store.set(e.key, e.value)
    return { value: undefined }
  })
  return { files, clock }
}

async function measureWeekly($: Engine, weeklyPercent: number, resetsAt: string) {
  await $.session.measure({
    context: { window: 200000, tokens: 84000, percent: 42 },
    rateLimits: [
      { kind: 'five_hour', percentUsed: 72.4, resetsAt },
      { kind: 'seven_day', percentUsed: weeklyPercent, resetsAt },
    ],
    changed: ['context', 'rateLimits'],
  })
}

async function footerText($: Engine, surface: (typeof SURFACES)[number]): Promise<string> {
  const footer = await $.ui.mount({ plugin: 'usage-meter', surface, component: 'SessionMode', props: { modes: [] } })
  const texts = await footer.findAll({ type: 'Text' })
  await footer.unmount()
  return texts.map(found => found.text ?? '').join('')
}

test('footer shows every metric and opens the settings pane on click', async ($, on) => {
  answerEngine(on)
  await measureWeekly($, 91, inCalendarDays(2))

  for (const surface of SURFACES) {
    const text = await footerText($, surface)
    expect(text).toMatch(/42%/)
    expect(text).toMatch(/72%/)
    expect(text).toMatch(/91%/)
    const footer = await $.ui.mount({ plugin: 'usage-meter', surface, component: 'SessionMode', props: { modes: [] } })
    expect(await footer.press({ key: 'open-settings-context' })).toBeDefined()
    await footer.unmount()
  }
})

test('daily budget splits the weekly remainder over the calendar days left and tracks today', async ($, on) => {
  answerEngine(on)
  const resetsAt = inCalendarDays(2)

  await measureWeekly($, 40, resetsAt)
  expect(await footerText($, 'terminal')).toMatch(/✓ 0%\/20%$/)

  await measureWeekly($, 52, resetsAt)
  expect(await footerText($, 'terminal')).toMatch(/✓ 12%\/20%$/)

  await measureWeekly($, 58, resetsAt)
  expect(await footerText($, 'terminal')).toMatch(/◐ 18%\/20%$/)

  await measureWeekly($, 61, resetsAt)
  expect(await footerText($, 'terminal')).toMatch(/✗ 21%\/20%$/)
})

test('daily budget can skip Saturdays and Sundays, always counting today', async ($, on) => {
  answerEngine(on)
  await measureWeekly($, 30, inCalendarDays(6))
  expect(await footerText($, 'terminal')).toMatch(/0%\/10%$/)

  const pane = await $.ui.mount({ plugin: 'usage-meter', surface: 'terminal', component: 'Pane', requestId: PANE_ID, props: PANE_PROPS })
  await pane.press({ key: 'weekends-false' })
  const today = new Date().getDay()
  const budgetDays = today === 0 || today === 6 ? 6 : 5
  expect(await footerText($, 'terminal')).toMatch(new RegExp(`0%/${Math.round(70 / budgetDays)}%$`))
  await pane.unmount()
})

test('every part of the footer opens the settings pane, hidden labels included', async ($, on) => {
  const opened: string[] = []
  answerEngine(on, opened)
  await measureWeekly($, 40, inCalendarDays(2))

  for (const surface of SURFACES) {
    const pane = await $.ui.mount({ plugin: 'usage-meter', surface, component: 'Pane', requestId: PANE_ID, props: PANE_PROPS })
    expect(await pane.find({ key: 'labels-hover' })).toBeDefined()
    expect(await pane.find({ text: 'English' })).toBeDefined()
    await pane.press({ key: 'labels-hover' })
    await pane.unmount()

    const footer = await $.ui.mount({ plugin: 'usage-meter', surface, component: 'SessionMode', props: { modes: [] } })
    expect(await footer.find({ type: 'Text', text: 'Context: ' })).toBeDefined()
    await footer.press({ key: 'open-settings-context-label' })
    await footer.unmount()
  }

  expect(opened.length).toBe(SURFACES.length)
})

test('context turns orange at 50% while the limits are still yellow there', async ($, on) => {
  answerEngine(on)
  await $.session.measure({
    context: { window: 200000, tokens: 104000, percent: 52 },
    rateLimits: [{ kind: 'five_hour', percentUsed: 52, resetsAt: inCalendarDays(0) }],
    changed: ['context', 'rateLimits'],
  })

  const footer = await $.ui.mount({ plugin: 'usage-meter', surface: 'terminal', component: 'SessionMode', props: { modes: [] } })
  const percents = await footer.findAll({ type: 'Text', text: '52%' })
  expect(percents.map(found => found.props?.color)).toEqual(['#fb923c', '#facc15'])
  await footer.unmount()
})

test('colors off also removes the daily budget pace color', async ($, on) => {
  answerEngine(on)
  await measureWeekly($, 40, inCalendarDays(2))
  const pane = await $.ui.mount({ plugin: 'usage-meter', surface: 'terminal', component: 'Pane', requestId: PANE_ID, props: PANE_PROPS })
  await pane.press({ key: 'colors-off' })
  await pane.unmount()

  const footer = await $.ui.mount({ plugin: 'usage-meter', surface: 'terminal', component: 'SessionMode', props: { modes: [] } })
  const pace = await footer.find({ type: 'Text', text: '✓ ' })
  expect(pace?.props).not.toHaveProperty('color', expect.any(String))
  await footer.unmount()
})

test('settings pane configures each metric on its own', async ($, on) => {
  answerEngine(on)
  await measureWeekly($, 40, inCalendarDays(2))

  for (const surface of SURFACES) {
    const pane = await $.ui.mount({ plugin: 'usage-meter', surface, component: 'Pane', requestId: PANE_ID, props: PANE_PROPS })

    await pane.press({ key: 'context-chart-dots' })
    await pane.press({ key: 'session-chart-bar' })
    await pane.press({ key: 'weekly-chart-pie' })
    const charts = await footerText($, surface)
    expect(charts).toMatch(/●+○+ 42%/)
    expect(charts).toMatch(/█+░+ 72%/)
    expect(charts).toMatch(/[○◔◑◕●] 40%/)

    await pane.press({ key: 'session-reset-false' })
    const withoutSessionReset = await footerText($, surface)
    expect(withoutSessionReset).not.toMatch(/72% ↻/)
    expect(withoutSessionReset).toMatch(/40% ↻/)

    await pane.press({ key: 'dailyBudget-visible' })
    expect(await footerText($, surface)).not.toMatch(/%\/\d+%/)

    await pane.press({ key: 'labels-always' })
    expect(await footerText($, surface)).toMatch(/Context:/)

    await pane.press({ key: 'language-pt-BR' })
    expect(await pane.find({ text: 'Idioma' })).toBeDefined()
    expect(await footerText($, surface)).toMatch(/Contexto:/)

    await pane.press({ key: 'restore' })
    const restored = await footerText($, surface)
    expect(restored).toMatch(/%\/\d+%/)
    expect(restored).not.toMatch(/Contexto:/)

    await pane.press({ key: 'language-en' })
    await pane.unmount()
  }
})

test('a newer reading from another terminal replaces the limits but keeps this context', async ($, on) => {
  const { files, clock } = answerEngine(on)
  await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })
  const resetsAt = inCalendarDays(2)
  await measureWeekly($, 40, resetsAt)
  const [sharedPath] = [...files.keys()]
  expect(sharedPath?.replaceAll('\\', '/')).toMatch(/\/home\/tester\/\.claude\/usage-meter\/latest-limits\.json$/)
  expect(JSON.parse(files.get(sharedPath ?? '') ?? '{}').weekly.percent).toBe(40)

  files.set(sharedPath ?? '', JSON.stringify({
    measuredAt: clock.now() + 1000,
    session: { percent: 90, resetsAt },
    weekly: { percent: 55, resetsAt },
  }))
  await clock.advance(10_000)

  const text = await footerText($, 'terminal')
  expect(text).toMatch(/42%/)
  expect(text).toMatch(/90%/)
  expect(text).toMatch(/55%/)
})

test('a measurement of the context alone keeps the limits it already has', async ($, on) => {
  answerEngine(on)
  await measureWeekly($, 40, inCalendarDays(2))
  await $.session.measure({ context: { window: 200000, tokens: 100000, percent: 50 }, rateLimits: [], changed: ['context'] })

  const text = await footerText($, 'terminal')
  expect(text).toMatch(/50%/)
  expect(text).toMatch(/72%/)
})

test('metrics without a reading are left out of the footer', async ($, on) => {
  answerEngine(on)
  await $.session.measure({ context: { window: 200000, tokens: 84000, percent: 42 }, rateLimits: [], changed: ['context'] })

  const text = await footerText($, 'terminal')
  expect(text).not.toMatch(/--/)
  expect(text.match(/%/g)).toHaveLength(1)
})

test('a terminal never replaces a newer reading another terminal published', async ($, on) => {
  const { files, clock } = answerEngine(on)
  await measureWeekly($, 40, inCalendarDays(2))
  const [sharedPath = ''] = [...files.keys()]
  const newer = JSON.stringify({ measuredAt: clock.now() + 60_000, session: { percent: 95 }, weekly: { percent: 70 } })
  files.set(sharedPath, newer)

  await measureWeekly($, 41, inCalendarDays(2))
  expect(files.get(sharedPath)).toBe(newer)
})

test('a half-written shared file is ignored until a whole one replaces it', async ($, on) => {
  const { files, clock } = answerEngine(on)
  await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })
  await measureWeekly($, 40, inCalendarDays(2))
  const [sharedPath = ''] = [...files.keys()]
  files.set(sharedPath, '{"measuredAt": 9999999999999, "session": {"perc')
  await clock.advance(10_000)
  expect(await footerText($, 'terminal')).toMatch(/72%/)

  await measureWeekly($, 45, inCalendarDays(2))
  expect(JSON.parse(files.get(sharedPath) ?? '{}').weekly.percent).toBe(45)
})

test('a compaction shrinks the context before the next response arrives', async ($, on) => {
  answerEngine(on)
  const summary: SessionMessage = { role: 'user', text: 'summary', toolUses: [], toolResults: [] }
  on('session.compact', () => ({
    messages: [summary],
    tokensBefore: 84000,
    tokensAfter: 8000,
  }))
  await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })
  await measureWeekly($, 40, inCalendarDays(2))

  await $.session.compact({ trigger: 'manual', messages: [summary] })

  const text = await footerText($, 'terminal')
  expect(text).toMatch(/^4% · 72%/)
})

test('an idle session drops a limit once its window has reset', async ($, on) => {
  const { clock } = answerEngine(on)
  await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })
  const inOneHour = new Date(Date.now() + HOUR_MS).toISOString()
  await $.session.measure({
    context: { window: 200000, tokens: 84000, percent: 42 },
    rateLimits: [
      { kind: 'five_hour', percentUsed: 72.4, resetsAt: inOneHour },
      { kind: 'seven_day', percentUsed: 40, resetsAt: inCalendarDays(2) },
    ],
    changed: ['context', 'rateLimits'],
  })

  await clock.advance(2 * HOUR_MS)

  const text = await footerText($, 'terminal')
  expect(text).not.toMatch(/72%/)
  expect(text).toMatch(/40%/)
})

test('a compaction computed ahead of time leaves the context as it is', async ($, on) => {
  answerEngine(on)
  const summary: SessionMessage = { role: 'user', text: 'summary', toolUses: [], toolResults: [] }
  on('session.compact', () => ({ messages: [summary], tokensBefore: 84000 }))
  await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })
  await measureWeekly($, 40, inCalendarDays(2))

  await $.session.compact({ trigger: 'precompute', messages: [summary] })

  expect(await footerText($, 'terminal')).toMatch(/^42% · 72%/)
})
