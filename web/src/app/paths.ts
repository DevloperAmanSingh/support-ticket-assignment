// The routes of the UI: the patterns the router matches and the builders of every link.
import type { CompanyId } from '@shared/ids.ts';

export const Tab = {
  Schedule: 'schedule',
  Coverage: 'coverage',
  Tickets: 'tickets',
} as const;
export type Tab = (typeof Tab)[keyof typeof Tab];

export const TABS = [Tab.Schedule, Tab.Coverage, Tab.Tickets] as const;

export const RoutePattern = {
  Home: '/',
  Company: '/c/:companyId',
  CompanyTab: '/c/:companyId/:tab',
} as const;

export function parseTab(value: string | undefined): Tab | null {
  return TABS.find((tab) => tab === value) ?? null;
}

export function tabPath({ companyId, tab }: { companyId: CompanyId; tab: Tab }): string {
  return `/c/${encodeURIComponent(companyId)}/${tab}`;
}

export function tabLabel(tab: Tab): string {
  switch (tab) {
    case Tab.Schedule:
      return 'Team schedule';
    case Tab.Coverage:
      return 'Coverage';
    case Tab.Tickets:
      return 'Tickets';
    default: {
      const _exhaustive: never = tab;
      return _exhaustive;
    }
  }
}
