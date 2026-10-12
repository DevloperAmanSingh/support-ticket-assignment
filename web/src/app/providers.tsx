import { QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { toast } from 'sonner';

import { classifyError, ErrorKind } from '@/api/client.ts';
import { createQueryClient } from '@/api/queries.ts';
import { BUSY_MESSAGE } from '@/components/ErrorBanner.tsx';
import { Toaster } from '@/components/ui/sonner';

/** A 503 means another request holds the company lock. Every failed call reports it the same way. */
function toastWhenBusy(error: Error): void {
  if (classifyError(error).kind === ErrorKind.Busy) toast.error(BUSY_MESSAGE);
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => createQueryClient({ onError: toastWhenBusy }));
  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <Toaster theme="dark" position="bottom-right" richColors />
    </QueryClientProvider>
  );
}
