import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';

import { TicketsQuerySchema } from '@shared/api-types.ts';
import type { CompanyView, TicketsQuery } from '@shared/api-types.ts';
import { TicketOrder, TicketStatus } from '@shared/codes.ts';
import type { TicketId } from '@shared/ids.ts';

import { useAgents, useTickets } from '@/api/queries.ts';
import { ErrorBanner, SubmitError } from '@/components/ErrorBanner.tsx';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { AgentNames } from '@/domain/reason.ts';

import { NewTicketForm } from './NewTicketForm.tsx';
import { ReasonSheet } from './ReasonSheet.tsx';
import { AssignAllAgainButton } from './RetryButtons.tsx';
import { TicketTable } from './TicketTable.tsx';

const STATUS_PARAM = 'status';
const ORDER_PARAM = 'order';
const ALL_TICKETS: TicketsQuery = { order: TicketOrder.Oldest };

/** Reads the filter and the order from the URL. Values the service does not know give every ticket, oldest first. */
function readQuery(searchParams: URLSearchParams): TicketsQuery {
  const parsed = TicketsQuerySchema.safeParse({
    status: searchParams.get(STATUS_PARAM) ?? undefined,
    order: searchParams.get(ORDER_PARAM) ?? undefined,
  });
  return parsed.success ? parsed.data : ALL_TICKETS;
}

function orderLabel(order: TicketOrder): string {
  switch (order) {
    case TicketOrder.Oldest:
      return 'Oldest first';
    case TicketOrder.Newest:
      return 'Newest first';
    default: {
      const _exhaustive: never = order;
      return _exhaustive;
    }
  }
}

export function TicketsTab({ company }: { company: CompanyView }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const { status = null, order } = readQuery(searchParams);
  const tickets = useTickets({ companyId: company.id, status, order });
  const agents = useAgents(company.id);
  const [selectedId, setSelectedId] = useState<TicketId | null>(null);
  // The failure of the last row action or of "Assign all again". The next action that works clears it.
  const [actionError, setActionError] = useState<Error | null>(null);

  const names: AgentNames = useMemo(
    () => new Map(agents.data?.agents.map((agent) => [agent.id, agent.name])),
    [agents.data],
  );

  const setParam = ({ name, value }: { name: string; value: string | null }) => {
    const next = new URLSearchParams(searchParams);
    if (value === null) next.delete(name);
    else next.set(name, value);
    setSearchParams(next);
  };

  const onlyUnassigned = status === TicketStatus.Unassigned;
  const list = tickets.data?.tickets ?? [];
  const selected = list.find((ticket) => ticket.ticket_id === selectedId) ?? null;

  return (
    <section className="grid grid-cols-[minmax(0,1fr)] gap-4">
      <div className="rounded-lg border bg-card p-4">
        <NewTicketForm companyId={company.id} names={names} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant={onlyUnassigned ? 'default' : 'outline'}
          aria-pressed={onlyUnassigned}
          onClick={() => {
            setParam({
              name: STATUS_PARAM,
              value: onlyUnassigned ? null : TicketStatus.Unassigned,
            });
          }}
        >
          Unassigned only
        </Button>
        <Select
          value={order}
          onValueChange={(value) => {
            const parsed = TicketsQuerySchema.shape.order.safeParse(value);
            if (parsed.success) setParam({ name: ORDER_PARAM, value: parsed.data });
          }}
        >
          <SelectTrigger aria-label="Order">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.values(TicketOrder).map((option) => (
              <SelectItem key={option} value={option}>
                {orderLabel(option)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="ml-auto">
          <AssignAllAgainButton companyId={company.id} onSettled={setActionError} />
        </div>
      </div>
      <SubmitError error={actionError} />
      {tickets.isPending && <p className="text-sm text-muted-foreground">Loading tickets…</p>}
      {tickets.isError && <ErrorBanner error={tickets.error} />}
      {tickets.data !== undefined &&
        (list.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {onlyUnassigned
              ? 'No unassigned tickets. Every ticket has an agent or is closed.'
              : 'No tickets yet. Create one above.'}
          </p>
        ) : (
          <div className="rounded-lg border bg-card">
            <TicketTable
              companyId={company.id}
              tickets={list}
              names={names}
              timezone={company.timezone}
              onSelect={(ticket) => {
                setSelectedId(ticket.ticket_id);
              }}
              onActionSettled={setActionError}
            />
          </div>
        ))}
      <ReasonSheet
        ticket={selected}
        names={names}
        timezone={company.timezone}
        onClose={() => {
          setSelectedId(null);
        }}
      />
    </section>
  );
}
