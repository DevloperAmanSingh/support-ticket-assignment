import type { AgentView } from '@shared/api-types.ts';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

function ShiftDot({ onShift }: { onShift: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span
        aria-hidden
        className={
          onShift
            ? 'size-2.5 rounded-full bg-on-shift'
            : 'size-2.5 rounded-full border border-muted-foreground/50'
        }
      />
      <span className={onShift ? '' : 'text-muted-foreground'}>
        {onShift ? 'On shift' : 'Off shift'}
      </span>
    </span>
  );
}

export function AgentTable({
  agents,
  onSelect,
}: {
  agents: readonly AgentView[];
  onSelect: (agent: AgentView) => void;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Agent</TableHead>
          <TableHead>Timezone</TableHead>
          <TableHead className="text-right">Ticket limit</TableHead>
          <TableHead className="text-right">Open tickets</TableHead>
          <TableHead>Now</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {agents.map((agent) => (
          <TableRow
            key={agent.id}
            className="cursor-pointer"
            onClick={() => {
              onSelect(agent);
            }}
          >
            <TableCell>
              <button
                type="button"
                className="rounded-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                aria-label={`Edit ${agent.name}`}
              >
                {agent.name}
              </button>
            </TableCell>
            <TableCell>{agent.timezone}</TableCell>
            <TableCell className="text-right tabular-nums">{agent.ticket_limit}</TableCell>
            <TableCell className="text-right tabular-nums">{agent.open_count}</TableCell>
            <TableCell>
              <ShiftDot onShift={agent.on_shift} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
