import { useState } from 'react';
import type { SubmitEvent } from 'react';
import { toast } from 'sonner';

import { UpdateAgentRequestSchema } from '@shared/api-types.ts';
import type { AgentView, UpdateAgentBody } from '@shared/api-types.ts';
import type { CompanyId } from '@shared/ids.ts';

import { useUpdateAgent } from '@/api/queries.ts';
import { SubmitError } from '@/components/ErrorBanner.tsx';
import { Field } from '@/components/Field.tsx';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
  errorAt,
  NO_FIELD_ERRORS,
  toFieldErrors,
  withoutErrorsAt,
} from '@/domain/fieldErrors.ts';
import { toWindowBody, toWindowDrafts } from '@/domain/windowDraft.ts';

import { ShiftFields, SHIFTS_PATH } from './ShiftFields.tsx';

/** The runtime list leaves out UTC, which the service accepts. */
const TIMEZONES = ['UTC', ...Intl.supportedValuesOf('timeZone')];
const TIMEZONE_LIST_ID = 'timezone-names';
/** The names of two fields in the update request, as the validation errors spell them. */
const TIMEZONE_FIELD = 'timezone';
const LIMIT_FIELD = 'ticket_limit';

export function AgentEditor({
  companyId,
  agent,
  onSaved,
}: {
  companyId: CompanyId;
  agent: AgentView;
  onSaved: () => void;
}) {
  const [timezone, setTimezone] = useState(agent.timezone);
  const [limit, setLimit] = useState(String(agent.ticket_limit));
  const [shifts, setShifts] = useState(() => toWindowDrafts(agent.shifts));
  const [errors, setErrors] = useState(NO_FIELD_ERRORS);
  const update = useUpdateAgent({
    companyId,
    onSuccess: () => {
      toast.success(`Schedule saved for ${agent.name}`);
    },
  });

  // An error stays until its field changes. Row errors go by position, so any change of the rows
  // drops them all: none can end under a row it does not belong to.
  const clearErrorsAt = (field: string) => {
    setErrors((current) => withoutErrorsAt(current, field));
  };

  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (update.isPending) return;
    const body: UpdateAgentBody = {
      timezone: timezone.trim(),
      ticket_limit: Number(limit),
      shifts: shifts.map(toWindowBody),
    };
    const parsed = UpdateAgentRequestSchema.safeParse(body);
    if (!parsed.success) {
      setErrors(toFieldErrors(parsed.error));
      return;
    }
    setErrors(NO_FIELD_ERRORS);
    // A callback on the call is dropped when this editor is no longer on screen. A save that
    // finishes late therefore never closes a sheet that was opened after it.
    update.mutate({ agentId: agent.id, body }, { onSuccess: onSaved });
  };

  return (
    <form onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
      <SheetHeader>
        <SheetTitle>{agent.name}</SheetTitle>
        <SheetDescription>
          Shift times are in the agent&apos;s own timezone. {agent.open_count} open now.
        </SheetDescription>
      </SheetHeader>
      <fieldset
        disabled={update.isPending}
        className="grid min-h-0 flex-1 content-start gap-5 overflow-y-auto px-4 pb-4"
      >
        <Field label="Timezone" error={errorAt(errors, TIMEZONE_FIELD)}>
          {(control) => (
            <Input
              {...control}
              list={TIMEZONE_LIST_ID}
              value={timezone}
              onChange={(event) => {
                setTimezone(event.target.value);
                clearErrorsAt(TIMEZONE_FIELD);
              }}
            />
          )}
        </Field>
        <datalist id={TIMEZONE_LIST_ID}>
          {TIMEZONES.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
        <Field label="Ticket limit" error={errorAt(errors, LIMIT_FIELD)}>
          {(control) => (
            <Input
              {...control}
              className="w-24 tabular-nums"
              type="number"
              min={1}
              value={limit}
              onChange={(event) => {
                setLimit(event.target.value);
                clearErrorsAt(LIMIT_FIELD);
              }}
            />
          )}
        </Field>
        <ShiftFields
          rows={shifts}
          errors={errors}
          onChange={(rows) => {
            setShifts(rows);
            clearErrorsAt(SHIFTS_PATH);
          }}
        />
        <SubmitError error={update.error} />
      </fieldset>
      <div className="border-t p-4">
        <Button type="submit" disabled={update.isPending}>
          {update.isPending ? 'Saving…' : 'Save schedule'}
        </Button>
      </div>
    </form>
  );
}
