import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { parseWeekStart } from '@/domain/week.ts';
import { ACME } from '@/test/fixtures.ts';
import { fallBackCoverage, springForwardCoverage } from '@/test/dstCoverage.ts';
import { renderApp } from '@/test/render.tsx';
import { backend, requestsTo, server } from '@/test/server.ts';

const COVERAGE_PATH = `/api/companies/${ACME.id}/coverage`;
const HOURS_PATH = `/api/companies/${ACME.id}/coverage-hours`;
const WEEK_URL = `/c/${ACME.id}/coverage?week=2026-10-12`;
const WEEKDAY_HOURS = [1, 2, 3, 4, 5].map((weekday) => ({ weekday, start: '09:00', end: '18:00' }));

const TRACK_RECT: DOMRect = {
  x: 0,
  y: 0,
  left: 0,
  top: 0,
  right: 1440,
  bottom: 100,
  width: 1440,
  height: 100,
  toJSON: () => ({}),
};

afterEach(() => {
  vi.restoreAllMocks();
});

function gaps(): HTMLElement {
  return screen.getByRole('list', { name: 'Coverage gaps' });
}

describe('coverage', () => {
  it('shows the repeated-hour gap and distinguishes both shifts by UTC offset', async () => {
    server.use(http.get(COVERAGE_PATH, () => HttpResponse.json(fallBackCoverage)));
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 1500, 100));
    const { user } = renderApp(`/c/${ACME.id}/coverage?week=2026-10-26`);
    await screen.findByRole('list', { name: 'Coverage gaps' });
    expect(screen.getByText('2 h gap')).toBeInTheDocument();
    expect(screen.getByText('25 h day')).toBeInTheDocument();
    expect(within(gaps()).getByText('Sun 1 Nov, 01:45 UTC-04:00 to 01:15 UTC-05:00')).toBeInTheDocument();
    const gap = screen.getByRole('img', { name: 'Sun 1 Nov: gap, 01:45 UTC-04:00 to 01:15 UTC-05:00' });
    expect(parseFloat(gap.style.left)).toBeCloseTo(7);
    expect(parseFloat(gap.style.width)).toBeCloseTo(2);
    const first = screen.getByRole('img', { name: 'Sun 1 Nov: Sam on shift, 01:15 UTC-04:00 to 01:45 UTC-04:00' });
    const second = screen.getByRole('img', { name: 'Sun 1 Nov: Sam on shift, 01:15 UTC-05:00 to 01:45 UTC-05:00' });
    expect(first).toHaveStyle({ left: '5%' });
    expect(second).toHaveStyle({ left: '9%' });
    await user.pointer({ target: gap, coords: { clientX: 120 } });
    const tooltip = within(screen.getByRole('tooltip'));
    expect(tooltip.getByText('Sun 1 Nov, 01:00 UTC-05:00')).toBeInTheDocument();
    expect(tooltip.getByText('Gap: nobody is on shift')).toBeInTheDocument();
  });

  it('uses a 23-hour track when clocks go forward', async () => {
    server.use(http.get(COVERAGE_PATH, () => HttpResponse.json(springForwardCoverage)));
    renderApp(`/c/${ACME.id}/coverage?week=2026-03-02`);
    await screen.findByRole('list', { name: 'Coverage gaps' });
    expect(screen.getByText('23 h day')).toBeInTheDocument();
    expect(screen.getByText('1 h 45 min gap')).toBeInTheDocument();
    const shift = screen.getByRole('img', { name: 'Sun 8 Mar: Sam on shift, 03:00 UTC-04:00 to 03:15 UTC-04:00' });
    expect(parseFloat(shift.style.left)).toBeCloseTo(120 / 1380 * 100);
    expect(parseFloat(shift.style.width)).toBeCloseTo(15 / 1380 * 100);
  });

  it('disables coverage edits until the submitted save finishes', async () => {
    const response = Promise.withResolvers<undefined>();
    server.use(http.put(HOURS_PATH, async () => { await response.promise; }));
    const { user } = renderApp(WEEK_URL);
    await screen.findByRole('list', { name: 'Coverage gaps' });
    await user.click(screen.getByRole('button', { name: 'Edit coverage hours' }));
    await user.click(screen.getByRole('button', { name: 'Save coverage hours' }));
    try {
      expect(screen.getByRole('textbox', { name: 'Start of range 1' })).toBeDisabled();
      expect(screen.getByRole('textbox', { name: 'End of range 1' })).toBeDisabled();
      expect(screen.getByRole('combobox', { name: 'Weekday of range 1' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Add range' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Remove range 1' })).toBeDisabled();
      await user.click(screen.getByRole('button', { name: 'Remove range 1' }));
      expect(screen.getByRole('textbox', { name: 'Start of range 6' })).toBeInTheDocument();
    } finally {
      response.resolve(undefined);
    }
    await screen.findByText('Coverage hours saved');
    expect(backend.hours).toHaveLength(6);
  });

  it('shows the week with the Saturday gap in company local time', async () => {
    renderApp(WEEK_URL);

    expect(await screen.findByRole('heading', { name: '12 Oct to 18 Oct 2026' })).toBeInTheDocument();
    await screen.findByRole('list', { name: 'Coverage gaps' });
    expect(within(gaps()).getByText('Sat 17 Oct, 09:00 to 13:00')).toBeInTheDocument();
    expect(within(gaps()).getByText('4 h')).toBeInTheDocument();
    expect(screen.getByText('Times are in America/New_York.')).toBeInTheDocument();

    // The timeline: the gap is red inside coverage hours, the rest of Saturday is grey.
    expect(screen.getByRole('img', { name: 'Sat 17 Oct: gap, 09:00 to 13:00' })).toHaveClass('bg-gap');
    expect(
      screen.getByRole('img', {
        name: 'Sat 17 Oct: nobody on shift outside coverage hours, 13:00 to 24:00',
      }),
    ).toHaveClass('bg-off-hours');
    const sam = screen.getByRole('img', { name: 'Mon 12 Oct: Sam on shift, 09:00 to 17:00' });
    expect(sam).toHaveStyle({ left: '37.5%' });
    expect(sam.style.width).toMatch(/^33\.3/);
  });

  it('changes the week: asks the service for the next Monday and puts it in the URL', async () => {
    const { user, router } = renderApp(WEEK_URL);
    await screen.findByRole('list', { name: 'Coverage gaps' });

    await user.click(screen.getByRole('button', { name: 'Next week' }));

    expect(await screen.findByRole('heading', { name: '19 Oct to 25 Oct 2026' })).toBeInTheDocument();
    expect(await within(gaps()).findByText('Sat 24 Oct, 09:00 to 13:00')).toBeInTheDocument();
    expect(router.state.location.search).toBe('?week=2026-10-19');
    expect(requestsTo({ method: 'GET', path: `${COVERAGE_PATH}?week=2026-10-19` })).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: 'Previous week' }));
    await user.click(screen.getByRole('button', { name: 'Previous week' }));

    expect(await within(gaps()).findByText('Sat 10 Oct, 09:00 to 13:00')).toBeInTheDocument();
    expect(router.state.location.search).toBe('?week=2026-10-05');
  });

  it('shows the current week when the URL names a day that is not a Monday', async () => {
    renderApp(`/c/${ACME.id}/coverage?week=2026-10-14`);

    await screen.findByRole('list', { name: 'Coverage gaps' });

    const weeks = backend.requests
      .filter((request) => request.path.startsWith(COVERAGE_PATH))
      .map((request) => new URL(request.path, window.location.origin).searchParams.get('week'));
    expect(weeks).toHaveLength(1);
    expect(weeks[0]).not.toBe('2026-10-14');
    expect(parseWeekStart(weeks[0] ?? null)).not.toBeNull();
  });

  it('saves the coverage hours from the sheet and shows the week without the gap', async () => {
    const { user } = renderApp(WEEK_URL);
    await screen.findByRole('list', { name: 'Coverage gaps' });

    await user.click(screen.getByRole('button', { name: 'Edit coverage hours' }));
    await user.click(await screen.findByRole('button', { name: 'Remove range 6' }));
    await user.click(screen.getByRole('button', { name: 'Save coverage hours' }));

    expect(await screen.findByText('Coverage hours saved')).toBeInTheDocument();
    expect(requestsTo({ method: 'PUT', path: HOURS_PATH })).toEqual([
      { method: 'PUT', path: HOURS_PATH, body: { hours: WEEKDAY_HOURS } },
    ]);
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Save coverage hours' })).not.toBeInTheDocument();
    });
    expect(
      await screen.findByText('No gaps this week. An agent is on shift in every coverage hour.'),
    ).toBeInTheDocument();
  });

  it('accepts 24:00 as the end of a range and rejects a range that ends before it starts', async () => {
    const { user } = renderApp(WEEK_URL);
    await screen.findByRole('list', { name: 'Coverage gaps' });
    await user.click(screen.getByRole('button', { name: 'Edit coverage hours' }));
    const end = () => screen.getByRole('textbox', { name: 'End of range 6' });

    await user.clear(end());
    await user.type(end(), '08:00');
    await user.click(screen.getByRole('button', { name: 'Save coverage hours' }));

    expect(await screen.findByText('a coverage range must start before it ends')).toBeInTheDocument();
    expect(requestsTo({ method: 'PUT', path: HOURS_PATH })).toEqual([]);

    await user.clear(end());
    await user.type(end(), '24:00');
    await user.click(screen.getByRole('button', { name: 'Save coverage hours' }));

    expect(await screen.findByText('Coverage hours saved')).toBeInTheDocument();
    expect(requestsTo({ method: 'PUT', path: HOURS_PATH })[0]?.body).toEqual({
      hours: [...WEEKDAY_HOURS, { weekday: 6, start: '09:00', end: '24:00' }],
    });
    // The refreshed week shows the longer gap. It ends at midnight, on the next date.
    expect(
      await within(gaps()).findByText('Sat 17 Oct, 09:00 to Sun 18 Oct, 00:00'),
    ).toBeInTheDocument();
    expect(within(gaps()).getByText('15 h')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Sat 17 Oct: gap, 09:00 to 24:00' })).toBeInTheDocument();
  });

  it('reads the minute under the pointer: who is on shift, or that it is a gap', async () => {
    // jsdom has no layout. A track 1440 px wide puts one minute on each pixel.
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(TRACK_RECT);
    const { user } = renderApp(WEEK_URL);
    await screen.findByRole('list', { name: 'Coverage gaps' });
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();

    await user.pointer({
      target: screen.getByRole('img', { name: 'Mon 12 Oct: Sam on shift, 09:00 to 17:00' }),
      coords: { clientX: 601 },
    });

    const staffed = within(screen.getByRole('tooltip'));
    expect(staffed.getByText('Mon 12 Oct, 10:00')).toBeInTheDocument();
    expect(staffed.getByText('Sam')).toBeInTheDocument();
    expect(staffed.getByText('09:00 to 17:00')).toBeInTheDocument();
    expect(staffed.getByText('Lee')).toBeInTheDocument();
    expect(staffed.getByText('Inside coverage hours.')).toBeInTheDocument();

    await user.pointer({
      target: screen.getByRole('img', { name: 'Sat 17 Oct: gap, 09:00 to 13:00' }),
      coords: { clientX: 660 },
    });

    const gap = within(screen.getByRole('tooltip'));
    expect(gap.getByText('Sat 17 Oct, 11:00')).toBeInTheDocument();
    expect(gap.getByText('Gap: nobody is on shift')).toBeInTheDocument();
    expect(gap.getByText('09:00 to 13:00, inside coverage hours.')).toBeInTheDocument();

    await user.pointer({ target: screen.getByRole('heading', { name: 'Ticket assignment' }) });

    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });
});
