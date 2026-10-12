import { toast } from 'sonner';

import type { RetryResponse, RetryResult } from '@shared/api-types.ts';
import { RetryOutcome } from '@shared/codes.ts';
import type { CompanyId, TicketId } from '@shared/ids.ts';

import { useRetryAssignments } from '@/api/queries.ts';
import { Button } from '@/components/ui/button';
import { ruleSentence, statusLabel } from '@/domain/reason.ts';

function toastRetryResult(result: RetryResult): void {
  const ticket = result.ticket_id;
  switch (result.outcome) {
    case RetryOutcome.Assigned:
      toast.success(`${ticket} assigned to ${result.agent.name}`);
      return;
    case RetryOutcome.Unassigned:
      toast.warning(`${ticket} is still unassigned. ${ruleSentence(result.reason.rule)}`);
      return;
    case RetryOutcome.Skipped:
      toast.info(`${ticket} skipped. Its status is ${statusLabel(result.status).toLowerCase()}.`);
      return;
    case RetryOutcome.Failed:
      toast.error(`${ticket} failed. ${result.error.message}`);
      return;
    default: {
      const _exhaustive: never = result;
      return _exhaustive;
    }
  }
}

function toastRetryResponse({ results }: RetryResponse): void {
  if (results.length === 0) toast.info('No unassigned tickets to assign');
  results.forEach(toastRetryResult);
}

/** Tells the owner of the list how an action ended: null when it worked, the error when it failed. */
export type ActionSettled = (error: Error | null) => void;

function useRetry({ companyId, onSettled }: { companyId: CompanyId; onSettled: ActionSettled }) {
  return useRetryAssignments({
    companyId,
    onSuccess: (response) => {
      toastRetryResponse(response);
      onSettled(null);
    },
    onError: onSettled,
  });
}

export function AssignAgainButton({
  companyId,
  ticketId,
  onSettled,
}: {
  companyId: CompanyId;
  ticketId: TicketId;
  onSettled: ActionSettled;
}) {
  const retry = useRetry({ companyId, onSettled });
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={retry.isPending}
      aria-label={`Assign ${ticketId} again`}
      onClick={(event) => {
        event.stopPropagation();
        retry.mutate({ ticket_id: ticketId });
      }}
    >
      {retry.isPending ? 'Assigning…' : 'Assign again'}
    </Button>
  );
}

export function AssignAllAgainButton({
  companyId,
  onSettled,
}: {
  companyId: CompanyId;
  onSettled: ActionSettled;
}) {
  const retry = useRetry({ companyId, onSettled });
  return (
    <Button
      variant="outline"
      disabled={retry.isPending}
      onClick={() => {
        retry.mutate({ all: true });
      }}
    >
      {retry.isPending ? 'Assigning…' : 'Assign all again'}
    </Button>
  );
}
