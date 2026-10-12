import { useState } from 'react';
import type { SubmitEvent } from 'react';
import { toast } from 'sonner';

import { UpdateCoverageHoursRequestSchema } from '@shared/api-types.ts';
import type { UpdateCoverageHoursBody, WindowView } from '@shared/api-types.ts';
import type { CompanyId } from '@shared/ids.ts';

import { useUpdateCoverageHours } from '@/api/queries.ts';
import { SubmitError } from '@/components/ErrorBanner.tsx';
import { Button } from '@/components/ui/button';
import { SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { WindowRows } from '@/components/WindowRows.tsx';
import type { WindowRowsText } from '@/components/WindowRows.tsx';
import { NO_FIELD_ERRORS, toFieldErrors, withoutErrorsAt } from '@/domain/fieldErrors.ts';
import { mondayDraft, toWindowBody, toWindowDrafts } from '@/domain/windowDraft.ts';
import type { WindowDraft } from '@/domain/windowDraft.ts';

const TEXT: WindowRowsText = {
  legend: 'Ranges',
  noun: 'range',
  add: 'Add range',
  empty: 'No ranges. Every hour of every day needs an agent.',
  endPlaceholder: '18:00 or 24:00',
};

const HOURS_PATH = 'hours';

function newRange(): WindowDraft {
  return mondayDraft({ start: '09:00', end: '18:00' });
}

function noCaption(): null {
  return null;
}

export function CoverageHoursEditor({
  companyId,
  timezone,
  hours,
  onSaved,
}: {
  companyId: CompanyId;
  timezone: string;
  hours: readonly WindowView[];
  onSaved: () => void;
}) {
  const [rows, setRows] = useState(() => toWindowDrafts(hours));
  const [errors, setErrors] = useState(NO_FIELD_ERRORS);
  const update = useUpdateCoverageHours({
    companyId,
    onSuccess: () => {
      toast.success('Coverage hours saved');
    },
  });

  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (update.isPending) return;
    const body: UpdateCoverageHoursBody = { hours: rows.map(toWindowBody) };
    const parsed = UpdateCoverageHoursRequestSchema.safeParse(body);
    if (!parsed.success) {
      setErrors(toFieldErrors(parsed.error));
      return;
    }
    setErrors(NO_FIELD_ERRORS);
    // A callback on the call is dropped when this editor is no longer on screen. A save that
    // finishes late therefore never closes a sheet that was opened after it.
    update.mutate(body, { onSuccess: onSaved });
  };

  return (
    <form onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
      <SheetHeader>
        <SheetTitle>Coverage hours</SheetTitle>
        <SheetDescription>
          The hours that need an agent on shift, in {timezone} time. A gap is a coverage hour with
          nobody on shift.
        </SheetDescription>
      </SheetHeader>
      <fieldset
        disabled={update.isPending}
        className="grid min-h-0 flex-1 content-start gap-3 overflow-y-auto px-4 pb-4"
      >
        <WindowRows
          text={TEXT}
          rows={rows}
          errors={errors}
          errorPath={HOURS_PATH}
          newRow={newRange}
          caption={noCaption}
          onChange={(next) => {
            setRows(next);
            // Row errors go by position, so they leave when the rows change.
            setErrors((current) => withoutErrorsAt(current, HOURS_PATH));
          }}
        />
        <p className="text-xs text-muted-foreground">
          A range ends at 24:00 at the latest. A full day is 00:00 to 24:00.
        </p>
        <SubmitError error={update.error} />
      </fieldset>
      <div className="border-t p-4">
        <Button type="submit" disabled={update.isPending}>
          {update.isPending ? 'Saving…' : 'Save coverage hours'}
        </Button>
      </div>
    </form>
  );
}
