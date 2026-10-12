// Query keys, hooks, and invalidation. Components call these hooks, never the endpoints.
import {
  keepPreviousData,
  MutationCache,
  QueryCache,
  QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import type { QueryKey } from '@tanstack/react-query';

import type {
  AssignRequest,
  AssignResponse,
  CloseResponse,
  CoverageHoursResponse,
  RetryRequest,
  RetryResponse,
  UpdateAgentBody,
  UpdateAgentResponse,
  UpdateCoverageHoursBody,
} from '@shared/api-types.ts';
import type { TicketOrder, TicketStatus } from '@shared/codes.ts';
import type { AgentId, CompanyId, TicketId } from '@shared/ids.ts';

import type { WeekStart } from '@/domain/week.ts';

import {
  assignTicket,
  closeTicket,
  getCoverage,
  listAgents,
  listCompanies,
  listTickets,
  retryAssignments,
  updateAgent,
  updateCoverageHours,
} from './endpoints.ts';

export type TicketFilter = {
  readonly companyId: CompanyId;
  readonly status: TicketStatus | null;
  readonly order: TicketOrder;
};

export type CoverageWeek = { readonly companyId: CompanyId; readonly week: WeekStart };

/** Every query key. A shorter key is a prefix of the longer ones, so it invalidates them all. */
export const queryKeys = {
  companies: () => ['companies'] as const,
  agents: (companyId: CompanyId) => ['agents', companyId] as const,
  coverage: (companyId: CompanyId) => ['coverage', companyId] as const,
  coverageWeek: ({ companyId, week }: CoverageWeek) => ['coverage', companyId, week] as const,
  tickets: (companyId: CompanyId) => ['tickets', companyId] as const,
  ticketList: ({ companyId, status, order }: TicketFilter) =>
    ['tickets', companyId, { status, order }] as const,
};

export function createQueryClient({ onError }: { onError: (error: Error) => void }): QueryClient {
  return new QueryClient({
    queryCache: new QueryCache({ onError }),
    mutationCache: new MutationCache({ onError }),
    defaultOptions: { queries: { retry: false } },
  });
}

async function invalidate(queryClient: QueryClient, keys: readonly QueryKey[]): Promise<void> {
  // Invalidation alone reuses an initial fetch with no cached data. Discard that older
  // response first, so even a mutation during initial loading gets a fresh read.
  await Promise.all(keys.map((queryKey) => queryClient.cancelQueries({ queryKey })));
  await Promise.all(keys.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
}

function assignmentKeys(companyId: CompanyId): QueryKey[] {
  return [queryKeys.tickets(companyId), queryKeys.agents(companyId)];
}

export function useCompanies() {
  return useQuery({ queryKey: queryKeys.companies(), queryFn: listCompanies });
}

export function useAgents(companyId: CompanyId) {
  return useQuery({
    queryKey: queryKeys.agents(companyId),
    queryFn: () => listAgents({ companyId }),
  });
}

export function useCoverage({ companyId, week }: CoverageWeek) {
  return useQuery({
    queryKey: queryKeys.coverageWeek({ companyId, week }),
    queryFn: () => getCoverage({ companyId, week }),
    // The previous week stays on screen while the next one loads.
    placeholderData: keepPreviousData,
  });
}

export function useTickets(filter: TicketFilter) {
  return useQuery({
    queryKey: queryKeys.ticketList(filter),
    queryFn: () => listTickets(filter),
  });
}

/**
 * The input of every mutation hook. `onSuccess` belongs to the mutation, not to the component, so it
 * also runs when the result removes the caller from the screen: a row button that the refreshed
 * table no longer shows still reports its outcome.
 */
type MutationInput<Result> = {
  readonly companyId: CompanyId;
  readonly onSuccess: (result: Result) => void;
};

/**
 * The input of a mutation that a control with no form starts, such as a button in a table row.
 * The control has no place for a failure, so the caller takes the error and shows it.
 */
type ActionInput<Result> = MutationInput<Result> & {
  readonly onError: (error: Error) => void;
};

export function useUpdateAgent({ companyId, onSuccess }: MutationInput<UpdateAgentResponse>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ agentId, body }: { agentId: AgentId; body: UpdateAgentBody }) =>
      updateAgent({ companyId, agentId, body }),
    onSuccess: (result) => {
      onSuccess(result);
      // A changed shift also changes the coverage of the week.
      return invalidate(queryClient, [
        ...assignmentKeys(companyId),
        queryKeys.coverage(companyId),
      ]);
    },
  });
}

export function useUpdateCoverageHours({
  companyId,
  onSuccess,
}: MutationInput<CoverageHoursResponse>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateCoverageHoursBody) => updateCoverageHours({ companyId, body }),
    onSuccess: (result) => {
      onSuccess(result);
      return invalidate(queryClient, [queryKeys.coverage(companyId)]);
    },
  });
}

export function useAssignTicket({ companyId, onSuccess }: MutationInput<AssignResponse>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: AssignRequest) => assignTicket({ companyId, body }),
    onSuccess: (result) => {
      onSuccess(result);
      return invalidate(queryClient, assignmentKeys(companyId));
    },
  });
}

export function useRetryAssignments({
  companyId,
  onSuccess,
  onError,
}: ActionInput<RetryResponse>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: RetryRequest) => retryAssignments({ companyId, body }),
    onSuccess: (result) => {
      onSuccess(result);
      return invalidate(queryClient, assignmentKeys(companyId));
    },
    onError,
  });
}

export function useCloseTicket({ companyId, onSuccess, onError }: ActionInput<CloseResponse>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ticketId: TicketId) => closeTicket({ companyId, ticketId }),
    onSuccess: (result) => {
      onSuccess(result);
      return invalidate(queryClient, assignmentKeys(companyId));
    },
    onError,
  });
}
