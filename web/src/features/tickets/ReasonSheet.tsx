import type { TicketView } from '@shared/api-types.ts';
import { Rule } from '@shared/codes.ts';

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { agentName, rejectionSentence, ruleSentence } from '@/domain/reason.ts';
import type { AgentNames, TicketReason } from '@/domain/reason.ts';
import { toLocalTime } from '@/domain/time.ts';

import { StatusBadge } from './TicketTable.tsx';

function SelectedAgent({
  reason,
  names,
  timezone,
}: {
  reason: TicketReason;
  names: AgentNames;
  timezone: string;
}) {
  switch (reason.rule) {
    case Rule.FewestOpen: {
      const { agent_id: agentId, open, limit, last_assigned_at: lastAssignedAt } = reason.selected;
      const before =
        lastAssignedAt === null
          ? 'No earlier assignment.'
          : `Earlier assignment: ${toLocalTime({ instant: lastAssignedAt, timezone }).label}.`;
      return (
        <p>
          <span className="font-medium">{agentName({ names, agentId })}</span> had {open} open
          with a limit of {limit}. {before}
        </p>
      );
    }
    case Rule.NoAgentOnShift:
    case Rule.AllAtLimit:
      return <p className="text-muted-foreground">No agent was selected.</p>;
    default: {
      const _exhaustive: never = reason;
      return _exhaustive;
    }
  }
}

function ReasonDetail({
  ticket,
  names,
  timezone,
}: {
  ticket: TicketView;
  names: AgentNames;
  timezone: string;
}) {
  const { reason } = ticket;
  return (
    <>
      <SheetHeader>
        <SheetTitle className="flex items-center gap-2">
          {ticket.ticket_id} <StatusBadge status={ticket.status} />
        </SheetTitle>
        <SheetDescription>
          Received {toLocalTime({ instant: ticket.created_at, timezone }).label}. Times are in{' '}
          {timezone}.
        </SheetDescription>
      </SheetHeader>
      <div className="grid gap-5 overflow-y-auto px-4 pb-4">
        <section className="grid gap-1">
          <h3 className="font-medium">Rule</h3>
          <p>{ruleSentence(reason.rule)}</p>
        </section>
        <section className="grid gap-1">
          <h3 className="font-medium">Selected agent</h3>
          <SelectedAgent reason={reason} names={names} timezone={timezone} />
        </section>
        <section className="grid gap-1">
          <h3 className="font-medium">Rejected agents</h3>
          {reason.rejected.length === 0 ? (
            <p className="text-muted-foreground">No agent was rejected.</p>
          ) : (
            <ul className="grid gap-1.5">
              {reason.rejected.map((rejected) => (
                <li key={rejected.agent_id}>
                  <span className="font-medium">
                    {agentName({ names, agentId: rejected.agent_id })}
                  </span>
                  <span className="text-muted-foreground">
                    {' '}
                    {rejectionSentence({ rejected, timezone })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}

export function ReasonSheet({
  ticket,
  names,
  timezone,
  onClose,
}: {
  ticket: TicketView | null;
  names: AgentNames;
  timezone: string;
  onClose: () => void;
}) {
  return (
    <Sheet
      open={ticket !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent className="gap-0 data-[side=right]:sm:max-w-md">
        {ticket !== null && <ReasonDetail ticket={ticket} names={names} timezone={timezone} />}
      </SheetContent>
    </Sheet>
  );
}
