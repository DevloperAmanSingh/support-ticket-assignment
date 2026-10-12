import { useId } from 'react';
import type { ReactNode } from 'react';

import { Label } from '@/components/ui/label';

export type FieldControl = {
  readonly id: string;
  readonly 'aria-invalid': boolean;
  readonly 'aria-describedby': string | undefined;
};

export function Field({
  label,
  error,
  children,
}: {
  label: string;
  error: string | null;
  children: (control: FieldControl) => ReactNode;
}) {
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children({
        id,
        'aria-invalid': error !== null,
        'aria-describedby': error === null ? undefined : errorId,
      })}
      {error !== null && (
        <p id={errorId} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
