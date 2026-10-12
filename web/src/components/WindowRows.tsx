import { XIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { errorAt } from '@/domain/fieldErrors.ts';
import type { FieldErrors } from '@/domain/fieldErrors.ts';
import { weekdayName, WEEKDAYS_FROM_MONDAY } from '@/domain/time.ts';
import type { WindowDraft } from '@/domain/windowDraft.ts';

/** The words of one list of rows: "Shifts" with "shift" rows, or "Coverage hours" with "range" rows. */
export type WindowRowsText = {
  readonly legend: string;
  readonly noun: string;
  readonly add: string;
  readonly empty: string;
  readonly endPlaceholder: string;
};

const TIME_FIELDS = [
  { name: 'start', label: 'Start' },
  { name: 'end', label: 'End' },
] as const;

function rowErrors({
  errors,
  errorPath,
  index,
}: {
  errors: FieldErrors;
  errorPath: string;
  index: number;
}): string[] {
  const messages: string[] = [];
  for (const { name, label } of TIME_FIELDS) {
    const message = errorAt(errors, errorPath, index, name);
    if (message !== null) messages.push(`${label}: ${message}`);
  }
  const whole = errorAt(errors, errorPath, index);
  if (whole !== null) messages.push(whole);
  return messages;
}

export function WindowRows({
  text,
  rows,
  errors,
  errorPath,
  newRow,
  caption,
  onChange,
}: {
  text: WindowRowsText;
  rows: readonly WindowDraft[];
  errors: FieldErrors;
  /** The name of the list in the request body: the first part of every error path. */
  errorPath: string;
  newRow: () => WindowDraft;
  caption: (row: WindowDraft) => string | null;
  onChange: (rows: WindowDraft[]) => void;
}) {
  const replaceRow = (next: WindowDraft) => {
    onChange(rows.map((row) => (row.key === next.key ? next : row)));
  };

  return (
    <fieldset className="grid gap-2">
      <legend className="mb-2 text-sm font-medium">{text.legend}</legend>
      {rows.length === 0 && <p className="text-sm text-muted-foreground">{text.empty}</p>}
      {rows.map((row, index) => {
        const rowName = `${text.noun} ${index + 1}`;
        const messages = rowErrors({ errors, errorPath, index });
        const note = caption(row);
        return (
          <div key={row.key} className="grid gap-1">
            <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-2">
              <Select
                value={String(row.weekday)}
                onValueChange={(value) => {
                  replaceRow({ ...row, weekday: Number(value) });
                }}
              >
                <SelectTrigger className="w-full" aria-label={`Weekday of ${rowName}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WEEKDAYS_FROM_MONDAY.map((weekday) => (
                    <SelectItem key={weekday} value={String(weekday)}>
                      {weekdayName(weekday)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                className="tabular-nums"
                aria-label={`Start of ${rowName}`}
                aria-invalid={errorAt(errors, errorPath, index, 'start') !== null}
                placeholder="09:00"
                inputMode="numeric"
                value={row.start}
                onChange={(event) => {
                  replaceRow({ ...row, start: event.target.value });
                }}
              />
              <Input
                className="tabular-nums"
                aria-label={`End of ${rowName}`}
                aria-invalid={errorAt(errors, errorPath, index, 'end') !== null}
                placeholder={text.endPlaceholder}
                inputMode="numeric"
                value={row.end}
                onChange={(event) => {
                  replaceRow({ ...row, end: event.target.value });
                }}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Remove ${rowName}`}
                onClick={() => {
                  onChange(rows.filter((other) => other.key !== row.key));
                }}
              >
                <XIcon />
              </Button>
            </div>
            {note !== null && <p className="text-xs text-muted-foreground">{note}</p>}
            {messages.map((message) => (
              <p key={message} role="alert" className="text-xs text-destructive">
                {message}
              </p>
            ))}
          </div>
        );
      })}
      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            onChange([...rows, newRow()]);
          }}
        >
          {text.add}
        </Button>
      </div>
    </fieldset>
  );
}
