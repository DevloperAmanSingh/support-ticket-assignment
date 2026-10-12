import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';

import type { CompanyView } from '@shared/api-types.ts';

import { useCoverage } from '@/api/queries.ts';
import { ErrorBanner } from '@/components/ErrorBanner.tsx';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { parseWeekStart, weekStartOf } from '@/domain/week.ts';
import type { WeekStart } from '@/domain/week.ts';

import { CoverageHoursEditor } from './CoverageHoursEditor.tsx';
import { GapList } from './GapList.tsx';
import { buildWeekLayout } from './layout.ts';
import { Timeline } from './Timeline.tsx';
import { WeekPicker } from './WeekPicker.tsx';

const WEEK_PARAM = 'week';

export function CoverageTab({ company }: { company: CompanyView }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [openedAt] = useState(() => new Date());
  const [isEditingHours, setIsEditingHours] = useState(false);
  const thisWeek = weekStartOf({ instant: openedAt, timezone: company.timezone });
  // A missing week, or one that is not a Monday, shows the current week.
  const week = parseWeekStart(searchParams.get(WEEK_PARAM)) ?? thisWeek;
  const coverage = useCoverage({ companyId: company.id, week });
  const days = useMemo(
    () => (coverage.data === undefined ? [] : buildWeekLayout(coverage.data)),
    [coverage.data],
  );

  const showWeek = (next: WeekStart) => {
    setSearchParams({ [WEEK_PARAM]: next });
  };

  return (
    <section className="grid grid-cols-[minmax(0,1fr)] gap-4">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <WeekPicker week={week} thisWeek={thisWeek} onChange={showWeek} />
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-muted-foreground">Times are in {company.timezone}.</p>
          <Button
            variant="outline"
            disabled={coverage.data === undefined}
            onClick={() => {
              setIsEditingHours(true);
            }}
          >
            Edit coverage hours
          </Button>
        </div>
      </div>
      {coverage.isPending && <p className="text-sm text-muted-foreground">Loading coverage…</p>}
      {coverage.isError && <ErrorBanner error={coverage.error} />}
      {coverage.data !== undefined && (
        <div
          className={`grid grid-cols-[minmax(0,1fr)] gap-4 transition-opacity ${
            coverage.isPlaceholderData ? 'opacity-60' : ''
          }`}
        >
          <GapList gaps={coverage.data.gaps} timezone={coverage.data.timezone} />
          <Timeline days={days} />
        </div>
      )}
      <Sheet open={isEditingHours} onOpenChange={setIsEditingHours}>
        <SheetContent className="gap-0 data-[side=right]:sm:max-w-lg">
          {/* Each opening starts from the saved hours. */}
          {isEditingHours && coverage.data !== undefined && (
            <CoverageHoursEditor
              companyId={company.id}
              timezone={coverage.data.timezone}
              hours={coverage.data.hours}
              onSaved={() => {
                setIsEditingHours(false);
              }}
            />
          )}
        </SheetContent>
      </Sheet>
    </section>
  );
}
