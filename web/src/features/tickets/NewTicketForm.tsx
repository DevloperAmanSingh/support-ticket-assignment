import { useState } from 'react';
import type { SubmitEvent } from 'react';

import { AssignRequestSchema } from '@shared/api-types.ts';
import type { AssignResponse } from '@shared/api-types.ts';
import { Rule } from '@shared/codes.ts';
import type { CompanyId } from '@shared/ids.ts';

import { useAssignTicket } from '@/api/queries.ts';
import { SubmitError } from '@/components/ErrorBanner.tsx';
import { Field } from '@/components/Field.tsx';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  errorAt,
  NO_FIELD_ERRORS,
  toFieldErrors,
  withoutErrorsAt,
} from '@/domain/fieldErrors.ts';
import { ruleSentence, shortReason } from '@/domain/reason.ts';
import type { AgentNames } from '@/domain/reason.ts';

const SUFFIX_START = 2;
const SUFFIX_LENGTH = 4;
const BASE_36 = 36;
/** The name of the field in the assign request, as the validation errors spell it. */
const TICKET_ID_FIELD = 'ticket_id';

/** A ticket id that is unlikely to exist: "T-" plus four random characters. */
function newTicketId(): string {
  const suffix = Math.random()
    .toString(BASE_36)
    .slice(SUFFIX_START, SUFFIX_START + SUFFIX_LENGTH)
    .toUpperCase();
  return `T-${suffix}`;
}

function resultSentence({
  response,
  names,
}: {
  response: AssignResponse;
  names: AgentNames;
}): string {
  const ticket = response.ticket_id;
  if (response.assigned) {
    if ('closed' in response) {
      return `${ticket} is closed. ${response.agent.name} had it.`;
    }
    return `${ticket} is assigned to ${response.agent.name}. ${shortReason({ reason: response.reason, names })}`;
  }
  const { reason } = response;
  switch (reason.rule) {
    case Rule.TicketClosed:
      return `${ticket} is closed and never had an agent.`;
    case Rule.NoAgentOnShift:
    case Rule.AllAtLimit:
      return `${ticket} is unassigned. ${ruleSentence(reason.rule)}`;
    default: {
      const _exhaustive: never = reason;
      return _exhaustive;
    }
  }
}

/** Sends a ticket to the assignment call, as the ticket system does, and shows the result. */
export function NewTicketForm({ companyId, names }: { companyId: CompanyId; names: AgentNames }) {
  const [ticketId, setTicketId] = useState(newTicketId);
  const [errors, setErrors] = useState(NO_FIELD_ERRORS);
  const assign = useAssignTicket({
    companyId,
    onSuccess: () => {
      setTicketId(newTicketId());
    },
  });

  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = AssignRequestSchema.safeParse({ ticket_id: ticketId.trim() });
    if (!parsed.success) {
      setErrors(toFieldErrors(parsed.error));
      return;
    }
    setErrors(NO_FIELD_ERRORS);
    assign.mutate(parsed.data);
  };

  return (
    <form onSubmit={submit} noValidate className="grid gap-2">
      <div className="flex flex-wrap items-end gap-2">
        <Field label="New ticket id" error={errorAt(errors, TICKET_ID_FIELD)}>
          {(control) => (
            <Input
              {...control}
              className="w-40"
              value={ticketId}
              onChange={(event) => {
                setTicketId(event.target.value);
                setErrors((current) => withoutErrorsAt(current, TICKET_ID_FIELD));
              }}
            />
          )}
        </Field>
        <Button type="submit" disabled={assign.isPending}>
          {assign.isPending ? 'Assigning…' : 'Create and assign'}
        </Button>
      </div>
      {assign.data !== undefined && (
        <p role="status" className="text-sm">
          {resultSentence({ response: assign.data, names })}
        </p>
      )}
      <SubmitError error={assign.error} />
    </form>
  );
}
