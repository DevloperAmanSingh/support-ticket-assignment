import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ACME } from '@/test/fixtures.ts';
import { renderApp } from '@/test/render.tsx';

function ticketsTab(): HTMLElement {
  return screen.getByRole('tab', { name: /Tickets/ });
}

describe('app', () => {
  it('shows the unassigned count in the Tickets tab label on every tab', async () => {
    const { user, router } = renderApp(`/c/${ACME.id}/schedule`);
    await screen.findByRole('tab', { name: /Tickets/ });

    expect(await within(ticketsTab()).findByLabelText('2 unassigned')).toHaveTextContent('2');
    expect(screen.getByRole('tab', { name: 'Team schedule' })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    await user.click(screen.getByRole('tab', { name: 'Coverage' }));

    expect(router.state.location.pathname).toBe('/c/acme/coverage');
    expect(screen.getByRole('tab', { name: 'Coverage' })).toHaveAttribute('aria-selected', 'true');
    expect(within(ticketsTab()).getByLabelText('2 unassigned')).toHaveTextContent('2');

    await user.click(ticketsTab());

    expect(router.state.location.pathname).toBe('/c/acme/tickets');
    expect(await screen.findByRole('button', { name: 'Assign all again' })).toBeInTheDocument();
    expect(within(ticketsTab()).getByLabelText('2 unassigned')).toHaveTextContent('2');
  });

  it('opens the first company from the start page', async () => {
    const { router } = renderApp('/');

    expect(await screen.findByRole('tab', { name: 'Team schedule' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/c/acme/schedule');
    expect(screen.getByRole('combobox', { name: 'Company' })).toHaveTextContent('Acme Support');
  });

  it('opens the schedule when the URL names a company without a tab', async () => {
    const { router } = renderApp(`/c/${ACME.id}`);

    expect(await screen.findByRole('button', { name: 'Edit Sam' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/c/acme/schedule');
  });

  it('says so when the URL names a company that does not exist', async () => {
    renderApp('/c/initech/schedule');

    expect(
      await screen.findByText('No company has the id "initech". Choose a company.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Company' })).toBeInTheDocument();
  });
});
