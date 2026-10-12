import { screen, waitFor, within } from '@testing-library/react';
import { delay, http } from 'msw';
import { describe, expect, it } from 'vitest';

import { ErrorCode } from '@shared/codes.ts';

import { ACME, AgentIds } from '@/test/fixtures.ts';
import { renderApp } from '@/test/render.tsx';
import { errorResponse, requestsTo, server } from '@/test/server.ts';

const SCHEDULE_URL = `/c/${ACME.id}/schedule`;
const SAM_PATH = `/api/companies/${ACME.id}/agents/${AgentIds.Sam}`;
const SAM_SHIFTS = [1, 2, 3, 4, 5].map((weekday) => ({ weekday, start: '09:00', end: '17:00' }));

async function openSam() {
  const app = renderApp(SCHEDULE_URL);
  await app.user.click(await screen.findByRole('button', { name: 'Edit Sam' }));
  return app;
}

function limitField(): HTMLElement {
  return screen.getByRole('spinbutton', { name: 'Ticket limit' });
}

describe('team schedule', () => {
  it('disables every editable field while saving and restores them after a failed save', async () => {
    const response = Promise.withResolvers<undefined>();
    server.use(http.put(SAM_PATH, async () => {
      await response.promise;
      return errorResponse({ status: 503, code: ErrorCode.LockTimeout, message: 'Busy' });
    }));
    const { user } = await openSam();
    await user.clear(limitField());
    await user.type(limitField(), '2');
    await user.click(screen.getByRole('button', { name: 'Save schedule' }));
    try {
      expect(limitField()).toBeDisabled();
      expect(screen.getByLabelText('Timezone')).toBeDisabled();
      expect(screen.getByRole('combobox', { name: 'Weekday of shift 1' })).toBeDisabled();
      expect(screen.getByRole('textbox', { name: 'Start of shift 1' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Add shift' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Remove shift 1' })).toBeDisabled();
      await user.type(limitField(), '3');
      expect(limitField()).toHaveValue(2);
    } finally {
      response.resolve(undefined);
    }
    await screen.findByText('Busy, try again');
    expect(limitField()).toBeEnabled();
    expect(limitField()).toHaveValue(2);
  });

  it('shows each agent with timezone, limit, open count, and shift state', async () => {
    renderApp(SCHEDULE_URL);

    const sam = within(await screen.findByRole('row', { name: /Sam/ }));
    expect(sam.getByText('America/New_York')).toBeInTheDocument();
    expect(sam.getByText('5')).toBeInTheDocument();
    expect(sam.getByText('2')).toBeInTheDocument();
    expect(sam.getByText('On shift')).toBeInTheDocument();

    const rahul = within(screen.getByRole('row', { name: /Rahul/ }));
    expect(rahul.getByText('Asia/Kolkata')).toBeInTheDocument();
    expect(rahul.getByText('Off shift')).toBeInTheDocument();
    expect(screen.getAllByRole('row')).toHaveLength(6);
  });

  it('saves an agent with the timezone, the limit, and every shift', async () => {
    const { user } = await openSam();

    await user.clear(limitField());
    await user.type(limitField(), '2');
    await user.click(screen.getByRole('button', { name: 'Save schedule' }));

    expect(await screen.findByText('Schedule saved for Sam')).toBeInTheDocument();
    expect(requestsTo({ method: 'PUT', path: SAM_PATH })).toEqual([
      {
        method: 'PUT',
        path: SAM_PATH,
        body: { timezone: 'America/New_York', ticket_limit: 2, shifts: SAM_SHIFTS },
      },
    ]);
    // The editor closes, and the table shows the saved limit.
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Save schedule' })).not.toBeInTheDocument();
    });
    const sam = within(await screen.findByRole('row', { name: /Sam/ }));
    expect(await sam.findByText('2', { selector: 'td:nth-child(3)' })).toBeInTheDocument();
  });

  it('keeps another editor open when an earlier save finishes late', async () => {
    // The save of Sam answers only after the lead has left his editor and opened the one of Lee.
    server.use(
      http.put(SAM_PATH, async () => {
        await delay(300);
      }),
    );
    const { user } = await openSam();

    await user.click(screen.getByRole('button', { name: 'Save schedule' }));
    await user.keyboard('{Escape}');
    await user.click(await screen.findByRole('button', { name: 'Edit Lee' }));
    const lee = await screen.findByRole('dialog', { name: 'Lee' });

    expect(await screen.findByText('Schedule saved for Sam')).toBeInTheDocument();
    await screen.findByRole('dialog', { name: 'Lee' });
    expect(lee).toBeInTheDocument();
    expect(within(lee).getByRole('button', { name: 'Save schedule' })).toBeEnabled();
  });

  it('sends an overnight shift as typed and says where it ends', async () => {
    const { user } = await openSam();

    await user.click(screen.getByRole('button', { name: 'Add shift' }));
    await user.clear(screen.getByRole('textbox', { name: 'Start of shift 6' }));
    await user.type(screen.getByRole('textbox', { name: 'Start of shift 6' }), '22:00');
    await user.clear(screen.getByRole('textbox', { name: 'End of shift 6' }));
    await user.type(screen.getByRole('textbox', { name: 'End of shift 6' }), '06:00');

    expect(screen.getByText('Overnight: Mon 22:00 to Tue 06:00.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Save schedule' }));

    expect(await screen.findByText('Schedule saved for Sam')).toBeInTheDocument();
    expect(requestsTo({ method: 'PUT', path: SAM_PATH })[0]?.body).toEqual({
      timezone: 'America/New_York',
      ticket_limit: 5,
      shifts: [...SAM_SHIFTS, { weekday: 1, start: '22:00', end: '06:00' }],
    });
  });

  it('shows each validation error under its field and sends nothing', async () => {
    const { user } = await openSam();

    await user.clear(limitField());
    await user.type(limitField(), '0');
    await user.clear(screen.getByLabelText('Timezone'));
    await user.type(screen.getByLabelText('Timezone'), 'Mars/Olympus');
    await user.clear(screen.getByRole('textbox', { name: 'Start of shift 1' }));
    await user.type(screen.getByRole('textbox', { name: 'Start of shift 1' }), '09:02');
    await user.click(screen.getByRole('button', { name: 'Save schedule' }));

    expect(await screen.findByText('ticket_limit must be 1 or more')).toBeInTheDocument();
    expect(screen.getByText('timezone must be an IANA timezone name')).toBeInTheDocument();
    expect(screen.getByText('Start: time must be on a 5-minute step')).toBeInTheDocument();
    expect(limitField()).toBeInvalid();
    expect(requestsTo({ method: 'PUT', path: SAM_PATH })).toEqual([]);
  });

  it('drops an error when its field changes, so none moves to another row', async () => {
    const { user } = await openSam();
    await user.clear(limitField());
    await user.type(limitField(), '0');
    await user.clear(screen.getByRole('textbox', { name: 'Start of shift 1' }));
    await user.type(screen.getByRole('textbox', { name: 'Start of shift 1' }), '09:02');
    await user.click(screen.getByRole('button', { name: 'Save schedule' }));
    expect(await screen.findByText('Start: time must be on a 5-minute step')).toBeInTheDocument();

    // Without shift 1, the old shift 2 is the first row. It is valid and shows no error.
    await user.click(screen.getByRole('button', { name: 'Remove shift 1' }));

    expect(screen.queryByText('Start: time must be on a 5-minute step')).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Start of shift 1' })).toBeValid();
    expect(screen.getByText('ticket_limit must be 1 or more')).toBeInTheDocument();

    await user.type(limitField(), '4');

    expect(screen.queryByText('ticket_limit must be 1 or more')).not.toBeInTheDocument();
    expect(limitField()).toBeValid();
  });

  it('shows the message of a 400 from the service under the form', async () => {
    server.use(
      http.put(SAM_PATH, () =>
        errorResponse({
          status: 400,
          code: ErrorCode.ValidationError,
          message: 'shifts: shifts of one agent must not overlap',
        }),
      ),
    );
    const { user } = await openSam();

    await user.click(screen.getByRole('button', { name: 'Save schedule' }));

    expect(
      await screen.findByText('shifts: shifts of one agent must not overlap'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save schedule' })).toBeEnabled();
  });

  it('shows a busy toast on a 503 and keeps the editor open', async () => {
    server.use(
      http.put(SAM_PATH, () =>
        errorResponse({ status: 503, code: ErrorCode.LockTimeout, message: 'Lock wait timed out' }),
      ),
    );
    const { user } = await openSam();

    await user.click(screen.getByRole('button', { name: 'Save schedule' }));

    expect(await screen.findByText('Busy, try again')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save schedule' })).toBeEnabled();
  });
});
