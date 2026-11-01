/** Overview page: the flow of work by station, pending Tickets requiring human action, active system problems, 24-hour flow counts, and Executor load. */
import type { ReactNode } from 'react'
import type { OverviewView } from '../app/views/overview.ts'
import { usePoll, type Problem } from './api.ts'
import { Button, Dot, Icon, type DotState } from './controls.tsx'
import { ticketMark } from './marks.ts'
import { useAction, usePanel, usePanelData } from './provider.tsx'
import { setupPage, settingsRoute, type Route } from './route.ts'
import { TicketLine } from './rows.tsx'
import { healthText, localized, reasonLabel, valueLabel, readableMarkers } from './text.ts'
import { CheckSetupButton, ConfirmButton, Hint, LoadState, Section, SetupMessage } from './widgets.tsx'

function ProblemLine({ problem, onChanged }: { problem: Problem; onChanged: () => Promise<void> }) {
  const { t, call, navigate } = usePanel()
  const post = useAction((request: () => Promise<unknown>) => request(), { reload: onChanged })
  const row = (title: string, detail: ReactNode, route: Route | undefined, hint?: string, actions?: ReactNode) => <li
    className="dt-row dt-link dt-att dt-att-error">
    <div className="dt-row-main">
      <div className="dt-att-what">{route ? <button type="button" className="dt-open dt-open-wrap"
        onClick={() => navigate(route)}>{title}</button> : title}</div>
      {detail}{hint && <Hint>{hint}</Hint>}{actions && <div className="dt-row-meta dt-row-buttons">{actions}</div>}
    </div>
  </li>
  const go = (label: string, route: Route) => <Button variant="outline" size="sm" icon={<Icon name="settings"
    size={14} />} onClick={() => navigate(route)}>{label}</Button>
  const raw = (text: string | undefined) => text && <p className="dt-error dt-clamp dt-mono">{text}</p>
  const worded = (text: string) => <p className="dt-error">{text}</p>
  switch (problem.kind) {
    // A failed Feishu bot check pauses only the Feishu Source; other setup problems halt the entire service.
    case 'setup': return row(t(problem.place === 'feishu' ? 'problemSetupFeishu' : 'problemSetup'), <p className="dt-error"><SetupMessage
      problem={problem} /></p>,
      setupPage(problem.place), t(`problemSetupFix.${problem.place}`), <CheckSetupButton />)
    case 'no-source': return row(t('problemNoSource'), undefined, settingsRoute('source'), undefined, go(t('actionOpenSources'),
      settingsRoute('source')))
    case 'no-allowed': return row(t('problemNoAllowed'), undefined, settingsRoute('eval'), undefined, go(t('actionAddAllowed'),
      settingsRoute('eval')))
    case 'executor-paused': return row(t('problemPaused'), undefined, { page: 'execution' }, undefined,
      <ConfirmButton variant="outline" icon="play" label={t('resumeProcessing')} title={t('resumeProcessing')}
        message={t('resumeProcessingConfirm')}
        onConfirm={async () => { await call('POST executor/pause', { body: { paused: false } }); await onChanged() }} />)
    case 'runtime-error': return row(t('problemRuntime', { name: valueLabel(t, 'health', problem.name) }), raw(problem.detail), undefined)
    case 'source-error': {
      const health = problem.source.health
      return row(t('sourceError', { source: localized(t, problem.source.title) }), health.code ? worded(healthText(t, health))
        : raw(health.detail), { page: 'source' }, t('sourceErrorHint'))
    }
    case 'eval-overdue': return row(t('problemEvalOverdue', { thread: readableMarkers(t, problem.thread.title) }), undefined, { page: 'trigger',
      id: problem.thread.key })
    case 'eval-unavailable': return row(t('problemEvalUnavailable', { thread: readableMarkers(t, problem.thread.title) }), raw(reasonLabel(t,
      problem.reason)),
      { page: 'trigger', id: problem.thread.key, query: { trigger: problem.triggerId } }, undefined, <>
        <Button variant="outline" size="sm" icon={<Icon name="refresh" size={14} />} disabled={post.busy}
          onClick={() => { void post.run(() => call('POST triggers/:id/requeue', { id: problem.triggerId })) }}>{t('requeue')}</Button>
        <Button variant="outline" size="sm" icon={<Icon name="dismiss" size={14} />} disabled={post.busy}
          onClick={() => { void post.run(() => call('POST decisions/:id/dismiss', { id: problem.decisionId })) }}>{t('dismiss')}</Button>
      </>)
    case 'outgoing': return row(t('problemReply', { source: valueLabel(t, 'source', problem.outgoing.channel.source),
      attempts: problem.outgoing.attempts }),
      raw(problem.outgoing.error), undefined)
  }
}

export function OverviewPage() {
  const { t, call, navigate } = usePanel()
  const { setup } = usePanelData()
  const { data, error, reload } = usePoll(() => call('GET overview'), [])
  if (!data) return <LoadState error={error} loading />
  const stat = (label: string, value: ReactNode, route?: Route) => <span className="dt-stat">
    <span className="dt-stat-label">{label}</span>
    {route ? <button type="button" className="dt-textlink dt-stat-value" onClick={() => navigate(route)}>{value}</button> : <span
      className="dt-stat-value">{value}</span>}
  </span>
  const more = (route: Route) => <button type="button" className="dt-textlink dt-more-link"
    onClick={() => navigate(route)}>{t('details')}</button>
  return <>
    {error && <LoadState error={error} loading={false} />}
    <Flow view={data} onChanged={reload} />
    <Section title={t('pendingTickets')} count={data.person.length}>
      {data.person.length ? <ul className="dt-list dt-cards">{data.person.map(ticket => <TicketLine key={ticket.id} ticket={ticket} question
        onChanged={reload} />)}</ul>
        : <Hint>{t('needsYouNone')}</Hint>}
    </Section>
    {data.problems.length > 0 && <Section title={t('problems')} count={data.problems.length}>
      <ul className="dt-list dt-cards">{data.problems.map((problem, index) => <ProblemLine key={index} problem={problem}
        onChanged={reload} />)}</ul>
    </Section>}
    <Section title={t('lastDay')} action={more({ page: 'trigger', query: { filter: 'recent' } })}>
      {/* Received and evaluated counts operate on Triggers rather than Threads or Decisions, so they do not link to filtered views. */}
      <div className="dt-stats">
        {stat(t('flowReceivedLabel'), data.flow.received)}
        {stat(t('flowFilteredLabel'), data.flow.filtered, data.flow.filtered ? { page: 'source' } : undefined)}
        {stat(t('flowJudgedLabel'), data.flow.judged)}
        {stat(t('flowAcceptedLabel'), data.flow.accepted, { page: 'eval', query: { window: '24h' } })}
        {data.flow.dropped > 0 && stat(t('flowDroppedLabel'), data.flow.dropped, { page: 'source' })}
      </div>
    </Section>
    <Section title={t('term.executor')} action={more({ page: 'execution' })}>
      {/* Pauses surface in `problems` above, so Executor counts render the same in both states; while setup waits, nothing runs. */}
      {setup?.problem ? <Hint>{t('executorWaitingSetup')}</Hint> : <div className="dt-stats">
        {stat(t('executingLabel'), `${data.executor.running} / ${data.executor.maxWorkers}`)}
        {stat(t('queuedLabel'), data.executor.queued)}
        {stat(t('idleLabel'), data.executor.idle)}
      </div>}
    </Section>
  </>
}

/** Stations in reading order; the first two lead in from Triggers rather than holding Tickets. */
const FLOW_ROWS = ['intake', 'eval', 'exec', 'deliver', 'ended'] as const
type FlowRow = typeof FLOW_ROWS[number]
/** A station's colour, which is also the colour of every Ticket resting in and every line entering it. */
const FLOW_STATE: Record<FlowRow, DotState> = { intake: 'done', eval: 'ongoing', exec: 'ongoing', deliver: 'warning', ended: 'idle' }

/**
 * The flow: each open Ticket rests in the station its stage belongs to, so the operator reads progress rather than a pile
 * of rows. A station's figure is the length of the list it shows, and the closed section names its own window.
 */
function Flow({ view, onChanged }: { view: OverviewView; onChanged: () => Promise<void> }) {
  const { t, navigate } = usePanel()
  // A service older than this page sends no stations; the flow then shows nothing rather than failing the whole overview.
  const stations = view.stations?.stations ?? []
  const hold = (row: FlowRow) => stations.find(item => item.station === row)
  const exec = hold('exec'), deliver = hold('deliver'), ended = hold('ended')
  const waiting = (exec?.waiting ?? 0) + (deliver?.waiting ?? 0)
  const detail = (row: FlowRow): ReactNode => {
    switch (row) {
      case 'intake': return t('flowIntakeDetail', { received: view.flow.received, filtered: view.flow.filtered })
      case 'eval': return view.flow.evaluating ? t('flowEvalDetail', { count: view.flow.evaluating }) : t('flowEvalNone')
      case 'exec': return t('flowExecutorDetail', { running: view.executor.running, max: view.executor.maxWorkers })
      case 'deliver': return waiting ? t('flowWaitingCount', { count: deliver?.waiting ?? 0 }) : t('flowNoneWaiting')
      case 'ended': return t('flowEndedDetail', { count: view.stations?.ended ?? 0 })
    }
  }
  // The lead-in rows only summarise; a station that holds Tickets lists them, and each opens its Ticket page.
  const tickets = (row: FlowRow) => row === 'intake' || row === 'eval' ? [] : hold(row)?.tickets ?? []
  return <section className="dt-section dt-flow">
    <h2 className="dt-section-title"><span className="dt-section-name">{t('flowTitle')}</span>
      {waiting > 0 && <span className="dt-count">{t('flowWaitingCount', { count: waiting })}</span>}</h2>
    <ol className="dt-flow-rows">
      {FLOW_ROWS.map(row => {
        const held = tickets(row)
        return <li key={row} className="dt-flow-row" data-station={row} data-state={FLOW_STATE[row]}>
          <span className="dt-flow-label"><Dot state={FLOW_STATE[row]} />{t(`station.${row}`)}</span>
          <div className="dt-flow-body">
            {held.length ? <div className="dt-flow-tokens">{held.map(ticket => {
              const { dot } = ticketMark(t, ticket)
              return <button key={ticket.id} type="button" className="dt-token" data-state={dot} title={ticket.title}
                onClick={() => navigate({ page: 'execution', id: ticket.id })}>
                {dot === 'ongoing' && <Dot state="ongoing" />}<span className="dt-token-name">{ticket.title}</span>
              </button>
            })}</div> : <span className="dt-flow-empty">{row === 'intake' || row === 'eval' ? detail(row)
              : t('flowEmptyStation')}</span>}
          </div>
          <span className="dt-flow-detail">{row === 'intake' || row === 'eval' ? null : detail(row)}</span>
        </li>
      })}
    </ol>
    <Hint>{t('flowIntro')}</Hint>
  </section>
}
