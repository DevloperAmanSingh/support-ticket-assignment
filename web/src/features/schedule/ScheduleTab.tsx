import { useState } from 'react';

import type { CompanyView } from '@shared/api-types.ts';
import type { AgentId } from '@shared/ids.ts';

import { useAgents } from '@/api/queries.ts';
import { ErrorBanner } from '@/components/ErrorBanner.tsx';
import { Sheet, SheetContent } from '@/components/ui/sheet';

import { AgentEditor } from './AgentEditor.tsx';
import { AgentTable } from './AgentTable.tsx';

export function ScheduleTab({ company }: { company: CompanyView }) {
  const agents = useAgents(company.id);
  const [selectedId, setSelectedId] = useState<AgentId | null>(null);

  if (agents.isPending) return <p className="text-sm text-muted-foreground">Loading agents…</p>;
  if (agents.isError) return <ErrorBanner error={agents.error} />;

  const list = agents.data.agents;
  const selected = list.find((agent) => agent.id === selectedId) ?? null;
  const close = () => {
    setSelectedId(null);
  };

  return (
    <section className="grid grid-cols-[minmax(0,1fr)] gap-3">
      <p className="text-sm text-muted-foreground">
        Choose an agent to change the timezone, the ticket limit, or the shifts.
      </p>
      {list.length === 0 ? (
        <p className="text-sm">This company has no agents, so every ticket stays unassigned.</p>
      ) : (
        <div className="rounded-lg border bg-card">
          <AgentTable
            agents={list}
            onSelect={(agent) => {
              setSelectedId(agent.id);
            }}
          />
        </div>
      )}
      <Sheet
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) close();
        }}
      >
        <SheetContent className="gap-0 data-[side=right]:sm:max-w-lg">
          {selected !== null && (
            <AgentEditor
              key={selected.id}
              companyId={company.id}
              agent={selected}
              onSaved={close}
            />
          )}
        </SheetContent>
      </Sheet>
    </section>
  );
}
