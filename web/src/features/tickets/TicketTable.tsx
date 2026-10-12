import { toast } from 'sonner';

import type { TicketView } from '@shared/api-types.ts';
import { TicketStatus } from '@shared/codes.ts';
import type { CompanyId, TicketId } from '@shared/ids.ts';

import { useCloseTicket } from '@/api/queries.ts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { rejectedSummary, shortReason, statusLabel } from '@/domain/reason.ts';
import type { AgentNames } from '@/domain/reason.ts';
import { toLocalTime } from '@/domain/time.ts';

import { AssignAgainButton } from './RetryButtons.tsx';
import type { ActionSettled } from './RetryButtons.tsx';

/** The badge of a ticket status. Unassigned stands out because it waits for the lead. */
export function StatusBadge({ status }: { status: TicketStatus }) {
  switch (status) {
    case TicketStatus.Open:
      return <Badge variant="outline">{statusLabel(status)}</Badge>;
    case TicketStatus.Unassigned:
      return <Badge className="bg-waiting-soft text-waiting">{statusLabel(status)}</Badge>;
    case TicketStatus.Closed:
      return <Badge variant="secondary">{statusLabel(status)}</Badge>;
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

function CloseButton({
  companyId,
  ticketId,
  onSettled,
}: {
  companyId: CompanyId;
  ticketId: TicketId;
  onSettled: ActionSettled;
}) {
  const close = useCloseTicket({
    companyId,
    onSuccess: (closed) => {
      toast.success(`${closed.ticket_id} closed`);
      onSettled(null);
    },
    onError: onSettled,
  });
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={close.isPending}
      aria-label={`Close ${ticketId}`}
      onClick={(event) => {
        event.stopPropagation();
        close.mutate(ticketId);
      }}
    >
      {close.isPending ? 'Closing…' : 'Close'}
    </Button>
  );
}

function RowAction({
  companyId,
  ticket,
  onSettled,
}: {
  companyId: CompanyId;
  ticket: TicketView;
  onSettled: ActionSettled;
}) {
  switch (ticket.status) {
    case TicketStatus.Unassigned:
      return (
        <AssignAgainButton
          companyId={companyId}
          ticketId={ticket.ticket_id}
          onSettled={onSettled}
        />
      );
    case TicketStatus.Open:
      return (
        <CloseButton companyId={companyId} ticketId={ticket.ticket_id} onSettled={onSettled} />
      );
    case TicketStatus.Closed:
      return null;
    default: {
      const _exhaustive: never = ticket;
      return _exhaustive;
    }
  }
}

export function TicketTable({
  companyId,
  tickets,
  names,
  timezone,
  onSelect,
  onActionSettled,
}: {
  companyId: CompanyId;
  tickets: readonly TicketView[];
  names: AgentNames;
  /** The timezone of the times in the table. */
  timezone: string;
  onSelect: (ticket: TicketView) => void;
  /** A row has no place for the failure of its action, so the owner of the table shows it. */
  onActionSettled: ActionSettled;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Ticket</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Agent</TableHead>
          <TableHead>Received</TableHead>
          <TableHead>Reason</TableHead>
          <TableHead>
            <span className="sr-only">Action</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {tickets.map((ticket) => {
          const rejected = rejectedSummary({ rejected: ticket.reason.rejected, names });
          return (
            <TableRow
              key={ticket.ticket_id}
              className="cursor-pointer"
              onClick={() => {
                onSelect(ticket);
              }}
            >
              <TableCell>
                <button
                  type="button"
                  className="rounded-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                  aria-label={`Show the reason for ${ticket.ticket_id}`}
                >
                  {ticket.ticket_id}
                </button>
              </TableCell>
              <TableCell>
                <StatusBadge status={ticket.status} />
              </TableCell>
              <TableCell>
                {ticket.agent === null ? (
                  <span className="text-muted-foreground">None</span>
                ) : (
                  ticket.agent.name
                )}
              </TableCell>
              <TableCell className="tabular-nums">
                {toLocalTime({ instant: ticket.created_at, timezone }).label}
              </TableCell>
              <TableCell className="max-w-md min-w-64 whitespace-normal">
                <p>{shortReason({ reason: ticket.reason, names })}</p>
                {rejected !== null && (
                  <p className="text-xs text-muted-foreground">Rejected: {rejected}</p>
                )}
              </TableCell>
              <TableCell className="text-right">
                <RowAction companyId={companyId} ticket={ticket} onSettled={onActionSettled} />
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
