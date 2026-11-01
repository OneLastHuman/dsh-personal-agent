/**
 * A person's message on a working ticket is never read and left unanswered: when its worker reads it and cannot take it up in its
 * own steps, the host owes the person a word, which the main Session gives once the turn that read it ends.
 */
import { expect, it } from 'vitest'
import { met, owed, progressCheckNotice } from '../src/app/notices.ts'
import type { Ticket, TicketInput } from '../src/core/index.ts'

/** A ticket whose running Assignment read, or did not, the person's message `input`. */
const ticketWith = (...inputs: TicketInput[]): Ticket => ({
  id: 't1', title: 'Fix the regression', decisionId: 'd', mandate: {} as Ticket['mandate'], channels: [], inputs, undelivered: [],
  createdAt: 'then', updatedAt: 'now', origin: { triggerId: 'trigger-0', triggerIds: ['trigger-0'] },
  assignments: [{ id: 'a', state: 'running', createdAt: 'then' }],
})
/** A person's message delivered to the ticket, whose worker names it as beyond its own steps when `metAt` is set. */
const person = (id: string, triggerId: string, metAt?: string): TicketInput =>
  ({ id, kind: 'trigger', triggerId, at: 'then', human: true, ...metAt ? { metAt } : {} })

it('owes the person whose message the worker could not take up an answer that names that message', () => {
  const ticket = ticketWith(person('input-1', 'trigger-1', 'now'))
  expect(owed(ticket)).toMatchObject({ id: 'input-1', triggerId: 'trigger-1' })
  expect(met(ticket)).toBe(true)
  const [name, value] = progressCheckNotice(ticket, owed(ticket)!)
  expect(name).toBe('progress-check:input-1')
  expect(value).toMatchObject({ kind: 'progress_check', trigger_id: 'trigger-1', silent_since: 'now' })
  expect(String(value.ask)).toContain('reply_to_trigger_id trigger-1')
  expect(String(value.ask)).toContain('orchestrator_ticket_note')
})

it('owes nothing for a message nobody could not take up, a bot\'s, or one read for context only', () => {
  expect(owed(ticketWith(person('input-1', 'trigger-1')))).toBeUndefined()
  expect(owed(ticketWith({ id: 'input-2', kind: 'trigger', triggerId: 'trigger-2', at: 'then', metAt: 'now' } as TicketInput))).toBeUndefined()
  expect(owed(ticketWith({ ...person('input-3', 'trigger-3', 'now'), context: true } as TicketInput))).toBeUndefined()
  expect(met(ticketWith())).toBe(false)
})

it('owes the oldest message first, so each answer names the message it settles', () => {
  const ticket = ticketWith(person('input-1', 'trigger-1', 'now'), person('input-2', 'trigger-2', 'now'))
  expect(owed(ticket)?.id).toBe('input-1')
  // The main Session's note, or the reply an answer queues, clears what the ticket owes (see `note` and `reply` in the engine).
  const settled = ticketWith(person('input-1', 'trigger-1', 'now'), person('input-2', 'trigger-2', 'now'))
  delete (settled.inputs[0]! as { metAt?: string }).metAt
  expect(owed(settled)?.id).toBe('input-2')
})
