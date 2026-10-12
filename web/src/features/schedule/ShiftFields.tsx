import { WindowRows } from '@/components/WindowRows.tsx';
import type { WindowRowsText } from '@/components/WindowRows.tsx';
import type { FieldErrors } from '@/domain/fieldErrors.ts';
import { isClockText, shiftLabel, wrapsMidnight } from '@/domain/time.ts';
import { mondayDraft, toWindowBody } from '@/domain/windowDraft.ts';
import type { WindowDraft } from '@/domain/windowDraft.ts';

const TEXT: WindowRowsText = {
  legend: 'Shifts',
  noun: 'shift',
  add: 'Add shift',
  empty: 'No shifts. This agent gets no tickets.',
  endPlaceholder: '17:00',
};

export const SHIFTS_PATH = 'shifts';

function newShift(): WindowDraft {
  return mondayDraft({ start: '09:00', end: '17:00' });
}

function overnightNote(row: WindowDraft): string | null {
  const shift = toWindowBody(row);
  if (!isClockText(shift.start) || !isClockText(shift.end) || !wrapsMidnight(shift)) return null;
  return `Overnight: ${shiftLabel(shift)}.`;
}

export function ShiftFields({
  rows,
  errors,
  onChange,
}: {
  rows: readonly WindowDraft[];
  errors: FieldErrors;
  onChange: (rows: WindowDraft[]) => void;
}) {
  return (
    <WindowRows
      text={TEXT}
      rows={rows}
      errors={errors}
      errorPath={SHIFTS_PATH}
      newRow={newShift}
      caption={overnightNote}
      onChange={onChange}
    />
  );
}
