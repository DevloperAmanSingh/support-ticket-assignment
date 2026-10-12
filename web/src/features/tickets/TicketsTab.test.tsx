import { act, screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';

import { ErrorCode } from '@shared/codes.ts';

import { ACME, TicketIds } from '@/test/fixtures.ts';
import { renderApp } from '@/test/render.tsx';
import { backend, errorResponse, requestsTo, server } from '@/test/server.ts';

const TICKETS_URL = `/c/${ACME.id}/tickets`;
const TICKETS_PATH = `/api/companies/${ACME.id}/tickets`;
const RETRY_PATH = `/api/companies/${ACME.id}/assignments/retry`;
const ASSIGN_PATH = `/api/companies/${ACME.id}/assignments`;

async function ticketRow(ticketId: string) {
  return within(await screen.findByRole('row', { name: new RegExp(ticketId) }));
}

function ticketIds(): string[] {
  return screen
    .getAllByRole('button', { name: /^Show the reason for/ })
    .map((button) => button.textContent);
}

describe('tickets', () => {
  it('shows a newly assigned ticket even when the initial list responds late', async () => {
    const initial = Promise.withResolvers<undefined>();
    const started = Promise.withResolvers<undefined>();
    let initialSent = false;
    server.use(http.get(TICKETS_PATH, async ({ request }) => {
      if (new URL(request.url).searchParams.has('status') || initialSent) return;
      initialSent = true;
      const snapshot = structuredClone(backend.tickets);
      started.resolve(undefined);
      await initial.promise;
      return HttpResponse.json({ tickets: snapshot });
    }));
    const { user } = renderApp(TICKETS_URL);
    await started.promise;
    try {
      const field = await screen.findByRole('textbox', { name: 'New ticket id' });
      await user.clear(field);
      await user.type(field, 'T-900');
      await user.click(screen.getByRole('button', { name: 'Create and assign' }));
      expect(await ticketRow('T-900')).toBeDefined();
    } finally {
      await act(async () => { initial.resolve(undefined); await initial.promise; });
    }
    expect(await ticketRow('T-900')).toBeDefined();
  });

  it('shows each ticket with status, agent, time, and short reason', async () => {
    renderApp(TICKETS_URL);

    const open = await ticketRow(TicketIds.T101);
    expect(open.getByText('Open')).toBeInTheDocument();
    expect(open.getByText('Sam')).toBeInTheDocument();
    expect(open.getByText('Wed 14 Oct, 08:00')).toBeInTheDocument();
    expect(
      open.getByText('Sam is on shift and has the fewest open tickets (0, with a limit of 5).'),
    ).toBeInTheDocument();
    expect(open.getByRole('button', { name: 'Close T-101' })).toBeInTheDocument();

    const waiting = await ticketRow(TicketIds.T104);
    expect(waiting.getByText('Unassigned')).toBeInTheDocument();
    expect(waiting.getByText('No agent is on shift.')).toBeInTheDocument();
    expect(
      waiting.getByText(
        'Rejected: Priya (not on shift), Sam (not on shift), Lee (not on shift), Rahul (not on shift), Emma (not on shift).',
      ),
    ).toBeInTheDocument();
  });

  it('retries one ticket: sends its id, shows the outcome, and updates the row and the badge', async () => {
    const { user } = renderApp(TICKETS_URL);
    await ticketRow(TicketIds.T104);
    expect(await screen.findByLabelText('2 unassigned')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Assign T-104 again' }));

    expect(await screen.findByText('T-104 assigned to Sam')).toBeInTheDocument();
    expect(requestsTo({ method: 'POST', path: RETRY_PATH })).toEqual([
      { method: 'POST', path: RETRY_PATH, body: { ticket_id: 'T-104' } },
    ]);
    const row = await ticketRow(TicketIds.T104);
    expect(await row.findByText('Open')).toBeInTheDocument();
    expect(row.getByText('Sam')).toBeInTheDocument();
    expect(row.getByRole('button', { name: 'Close T-104' })).toBeInTheDocument();
    expect(await screen.findByLabelText('1 unassigned')).toBeInTheDocument();
  });

  it('retries every unassigned ticket and shows each outcome', async () => {
    const { user } = renderApp(TICKETS_URL);
    await ticketRow(TicketIds.T104);

    await user.click(screen.getByRole('button', { name: 'Assign all again' }));

    expect(await screen.findByText('T-104 assigned to Sam')).toBeInTheDocument();
    expect(screen.getByText('T-105 assigned to Sam')).toBeInTheDocument();
    expect(requestsTo({ method: 'POST', path: RETRY_PATH })[0]?.body).toEqual({ all: true });
    expect(await screen.findByLabelText('0 unassigned')).toBeInTheDocument();
  });

  it('closes an open ticket', async () => {
    const { user } = renderApp(TICKETS_URL);
    await ticketRow(TicketIds.T101);

    await user.click(screen.getByRole('button', { name: 'Close T-101' }));

    expect(await screen.findByText('T-101 closed')).toBeInTheDocument();
    expect(requestsTo({ method: 'POST', path: `${TICKETS_PATH}/T-101/close` })).toHaveLength(1);
    const row = await ticketRow(TicketIds.T101);
    expect(await row.findByText('Closed')).toBeInTheDocument();
    expect(row.queryByRole('button', { name: 'Close T-101' })).not.toBeInTheDocument();
  });

  it('shows the message of the service when a row action fails with a 404', async () => {
    server.use(
      http.post(`${TICKETS_PATH}/T-101/close`, () =>
        errorResponse({ status: 404, code: ErrorCode.TicketNotFound, message: 'Ticket not found' }),
      ),
    );
    const { user } = renderApp(TICKETS_URL);
    await ticketRow(TicketIds.T101);

    await user.click(screen.getByRole('button', { name: 'Close T-101' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Ticket not found');
    expect(screen.getByRole('button', { name: 'Close T-101' })).toBeEnabled();
  });

  it('shows a generic banner when a row action fails unexpectedly, and clears it on the next success', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    server.use(
      http.post(
        RETRY_PATH,
        () => errorResponse({ status: 500, code: ErrorCode.InternalError, message: 'Internal error' }),
        { once: true },
      ),
    );
    const { user } = renderApp(TICKETS_URL);
    await ticketRow(TicketIds.T104);

    await user.click(screen.getByRole('button', { name: 'Assign T-104 again' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Something went wrong. Reload the page or try again.',
    );
    expect(logged).toHaveBeenCalledOnce();

    await user.click(screen.getByRole('button', { name: 'Assign T-104 again' }));

    expect(await screen.findByText('T-104 assigned to Sam')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
    logged.mockRestore();
  });

  it('reports a ticket that the service does not know as failed', async () => {
    const { user } = renderApp(TICKETS_URL);
    await ticketRow(TicketIds.T104);
    // The ticket leaves the service after the list was read.
    backend.tickets = backend.tickets.filter((ticket) => ticket.ticket_id !== TicketIds.T104);

    await user.click(screen.getByRole('button', { name: 'Assign T-104 again' }));

    expect(await screen.findByText('T-104 failed. Ticket not found')).toBeInTheDocument();
  });

  it('keeps the filter and the order in the URL and sends them to the service', async () => {
    const { user, router } = renderApp(`${TICKETS_URL}?status=unassigned&order=newest`);

    await ticketRow(TicketIds.T104);
    expect(ticketIds()).toEqual(['T-105', 'T-104']);
    expect(screen.getByRole('button', { name: 'Unassigned only' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(
      requestsTo({ method: 'GET', path: `${TICKETS_PATH}?order=newest&status=unassigned` }),
    ).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: 'Unassigned only' }));

    await ticketRow(TicketIds.T101);
    expect(router.state.location.search).toBe('?order=newest');
    expect(ticketIds()).toEqual(['T-103', 'T-102', 'T-101', 'T-105', 'T-104']);
  });

  it('opens the full reason of a row: the rule, the selected agent, each rejected agent', async () => {
    const { user } = renderApp(TICKETS_URL);
    await ticketRow(TicketIds.T104);
    await user.click(screen.getByRole('button', { name: 'Assign T-104 again' }));
    await screen.findByText('T-104 assigned to Sam');

    await user.click(screen.getByRole('button', { name: 'Show the reason for T-104' }));

    const sheet = within(await screen.findByRole('dialog'));
    expect(
      sheet.getByText('The agent on shift with the fewest open tickets gets the ticket.'),
    ).toBeInTheDocument();
    expect(sheet.getByText(/had 2 open with a limit of 5/)).toBeInTheDocument();
    expect(sheet.getByText(/Earlier assignment: Wed 14 Oct, 10:00\./)).toBeInTheDocument();
    expect(sheet.getByText('Rahul')).toBeInTheDocument();
    expect(sheet.getByText('Not on shift.')).toBeInTheDocument();
    expect(sheet.getByText('Lee')).toBeInTheDocument();
    expect(sheet.getByText('At the ticket limit with 3 open.')).toBeInTheDocument();
  });

  it('creates a ticket through the assignment call and shows the result', async () => {
    const { user } = renderApp(TICKETS_URL);
    await ticketRow(TicketIds.T104);
    const field = screen.getByRole<HTMLInputElement>('textbox', { name: 'New ticket id' });
    expect(field.value).toMatch(/^T-[0-9A-Z]{1,4}$/);

    await user.clear(field);
    await user.type(field, 'T-900');
    await user.click(screen.getByRole('button', { name: 'Create and assign' }));

    expect(
      await screen.findByText(
        'T-900 is assigned to Sam. Sam is on shift and has the fewest open tickets (2, with a limit of 5).',
      ),
    ).toBeInTheDocument();
    expect(requestsTo({ method: 'POST', path: ASSIGN_PATH })).toEqual([
      { method: 'POST', path: ASSIGN_PATH, body: { ticket_id: 'T-900' } },
    ]);
    expect(await ticketRow('T-900')).toBeDefined();
    expect(field).not.toHaveValue('T-900');
  });

  it('rejects an empty ticket id under the field and sends nothing', async () => {
    const { user } = renderApp(TICKETS_URL);
    await ticketRow(TicketIds.T104);

    await user.clear(screen.getByRole('textbox', { name: 'New ticket id' }));
    await user.click(screen.getByRole('button', { name: 'Create and assign' }));

    expect(screen.getByRole('textbox', { name: 'New ticket id' })).toBeInvalid();
    expect(requestsTo({ method: 'POST', path: ASSIGN_PATH })).toEqual([]);
  });
});
