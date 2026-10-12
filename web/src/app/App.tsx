import type { ReactNode } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router';

import type { CompanyView } from '@shared/api-types.ts';
import { TicketOrder, TicketStatus } from '@shared/codes.ts';
import type { CompanyId } from '@shared/ids.ts';

import { useCompanies, useTickets } from '@/api/queries.ts';
import { Banner, ErrorBanner } from '@/components/ErrorBanner.tsx';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CoverageTab } from '@/features/coverage/CoverageTab.tsx';
import { ScheduleTab } from '@/features/schedule/ScheduleTab.tsx';
import { TicketsTab } from '@/features/tickets/TicketsTab.tsx';

import { parseTab, Tab, tabLabel, tabPath, TABS } from './paths.ts';

function Shell({ selector, children }: { selector: ReactNode; children: ReactNode }) {
  return (
    <div className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)] gap-5 px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">Ticket assignment</h1>
        {selector}
      </header>
      {children}
    </div>
  );
}

function CompanySelect({
  companies,
  selectedId,
  tab,
}: {
  companies: readonly CompanyView[];
  /** Null when the URL names no company of the list. */
  selectedId: CompanyId | null;
  tab: Tab;
}) {
  const navigate = useNavigate();
  return (
    <Select
      value={selectedId ?? ''}
      onValueChange={(value) => {
        const company = companies.find((candidate) => candidate.id === value);
        if (company !== undefined) void navigate(tabPath({ companyId: company.id, tab }));
      }}
    >
      <SelectTrigger aria-label="Company" className="min-w-48">
        <SelectValue placeholder="Choose a company" />
      </SelectTrigger>
      <SelectContent>
        {companies.map((company) => (
          <SelectItem key={company.id} value={company.id}>
            {company.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function UnassignedBadge({ companyId }: { companyId: CompanyId }) {
  const unassigned = useTickets({
    companyId,
    status: TicketStatus.Unassigned,
    order: TicketOrder.Oldest,
  });
  if (unassigned.data === undefined) return null;
  const count = unassigned.data.tickets.length;
  return (
    <Badge
      aria-label={`${count} unassigned`}
      className={count === 0 ? 'bg-muted text-muted-foreground' : 'bg-waiting-soft text-waiting'}
    >
      {count}
    </Badge>
  );
}

function TabBody({ company, tab }: { company: CompanyView; tab: Tab }) {
  switch (tab) {
    case Tab.Schedule:
      return <ScheduleTab company={company} />;
    case Tab.Coverage:
      return <CoverageTab company={company} />;
    case Tab.Tickets:
      return <TicketsTab company={company} />;
    default: {
      const _exhaustive: never = tab;
      return _exhaustive;
    }
  }
}

function Workspace({ company, tab }: { company: CompanyView; tab: Tab }) {
  const navigate = useNavigate();
  return (
    <Tabs
      value={tab}
      className="gap-5"
      onValueChange={(value) => {
        const next = parseTab(value);
        if (next !== null) void navigate(tabPath({ companyId: company.id, tab: next }));
      }}
    >
      <TabsList variant="line" className="border-b">
        {TABS.map((item) => (
          <TabsTrigger key={item} value={item} className="px-3">
            {tabLabel(item)}
            {item === Tab.Tickets && <UnassignedBadge companyId={company.id} />}
          </TabsTrigger>
        ))}
      </TabsList>
      {/* The key drops every state of the previous company. */}
      <TabsContent key={company.id} value={tab} className="min-w-0">
        <TabBody company={company} tab={tab} />
      </TabsContent>
    </Tabs>
  );
}

export function App() {
  const { companyId, tab } = useParams();
  const companies = useCompanies();

  if (companies.isPending) {
    return (
      <Shell selector={null}>
        <p className="text-sm text-muted-foreground">Loading companies…</p>
      </Shell>
    );
  }
  if (companies.isError) {
    return (
      <Shell selector={null}>
        <ErrorBanner error={companies.error} />
      </Shell>
    );
  }

  const list = companies.data.companies;
  const company = list.find((candidate) => candidate.id === companyId);
  const activeTab = parseTab(tab);

  if (company === undefined) {
    return (
      <Shell
        selector={
          <CompanySelect companies={list} selectedId={null} tab={activeTab ?? Tab.Schedule} />
        }
      >
        <Banner message={`No company has the id "${companyId ?? ''}". Choose a company.`} />
      </Shell>
    );
  }
  if (activeTab === null) {
    return <Navigate replace to={tabPath({ companyId: company.id, tab: Tab.Schedule })} />;
  }
  return (
    <Shell selector={<CompanySelect companies={list} selectedId={company.id} tab={activeTab} />}>
      <Workspace company={company} tab={activeTab} />
    </Shell>
  );
}

export function CompanyIndex() {
  const companies = useCompanies();
  if (companies.isPending) {
    return (
      <Shell selector={null}>
        <p className="text-sm text-muted-foreground">Loading companies…</p>
      </Shell>
    );
  }
  if (companies.isError) {
    return (
      <Shell selector={null}>
        <ErrorBanner error={companies.error} />
      </Shell>
    );
  }
  const first = companies.data.companies[0];
  if (first === undefined) {
    return (
      <Shell selector={null}>
        <Banner message="No companies yet. Load the sample data with `npm run seed` in server/." />
      </Shell>
    );
  }
  return <Navigate replace to={tabPath({ companyId: first.id, tab: Tab.Schedule })} />;
}
