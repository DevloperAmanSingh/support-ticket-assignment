import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { shiftWeek, weekLabel } from '@/domain/week.ts';
import type { WeekStart } from '@/domain/week.ts';

export function WeekPicker({
  week,
  thisWeek,
  onChange,
}: {
  week: WeekStart;
  thisWeek: WeekStart;
  onChange: (week: WeekStart) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant="outline"
        size="icon"
        aria-label="Previous week"
        onClick={() => {
          onChange(shiftWeek({ week, weeks: -1 }));
        }}
      >
        <ChevronLeftIcon />
      </Button>
      <Button
        variant="outline"
        size="icon"
        aria-label="Next week"
        onClick={() => {
          onChange(shiftWeek({ week, weeks: 1 }));
        }}
      >
        <ChevronRightIcon />
      </Button>
      <Button
        variant="outline"
        disabled={week === thisWeek}
        onClick={() => {
          onChange(thisWeek);
        }}
      >
        This week
      </Button>
      <h2 className="ml-1 text-base font-medium tabular-nums">{weekLabel(week)}</h2>
    </div>
  );
}
