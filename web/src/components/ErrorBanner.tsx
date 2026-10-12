import { classifyError, ErrorKind } from '@/api/client.ts';

export const BUSY_MESSAGE = 'Busy, try again';
const UNEXPECTED_MESSAGE = 'Something went wrong. Reload the page or try again.';

export function Banner({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
    >
      {message}
    </div>
  );
}

function bannerMessage(error: Error): string {
  const classified = classifyError(error);
  switch (classified.kind) {
    case ErrorKind.NotFound:
    case ErrorKind.Validation:
      return classified.message;
    case ErrorKind.Busy:
      return BUSY_MESSAGE;
    case ErrorKind.Unexpected:
      return UNEXPECTED_MESSAGE;
    default: {
      const _exhaustive: never = classified;
      return _exhaustive;
    }
  }
}

/** Shows a failed request. A 404 shows the message of the service, an unexpected error a generic line. */
export function ErrorBanner({ error }: { error: Error }) {
  return <Banner message={bannerMessage(error)} />;
}

/** Shows a failed save or action next to its control. A 503 shows nothing here because the toast reports it. */
export function SubmitError({ error }: { error: Error | null }) {
  if (error === null) return null;
  const classified = classifyError(error);
  switch (classified.kind) {
    case ErrorKind.Busy:
      return null;
    case ErrorKind.Validation:
      return (
        <p role="alert" className="text-sm text-destructive">
          {classified.message}
        </p>
      );
    case ErrorKind.NotFound:
    case ErrorKind.Unexpected:
      return <ErrorBanner error={error} />;
    default: {
      const _exhaustive: never = classified;
      return _exhaustive;
    }
  }
}
