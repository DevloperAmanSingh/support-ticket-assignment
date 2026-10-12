import '@testing-library/jest-dom/vitest';

import { cleanup, configure } from '@testing-library/react';
import { toast } from 'sonner';
import { afterAll, afterEach, beforeAll } from 'vitest';

import { resetBackend, server } from './server.ts';

// A busy machine can take more than the default second to render a page.
configure({ asyncUtilTimeout: 3000 });

// The parts of the browser that Radix and Sonner use and jsdom does not have.
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
globalThis.ResizeObserver = ResizeObserverStub;
Element.prototype.hasPointerCapture = () => false;
Element.prototype.scrollIntoView = () => {};
Object.defineProperty(window, 'matchMedia', {
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

beforeAll(() => {
  // A request no handler knows fails the test, so no test passes on a call to a wrong URL.
  server.listen({ onUnhandledRequest: 'error' });
});

afterEach(() => {
  cleanup();
  toast.dismiss();
  server.resetHandlers();
  resetBackend();
});

afterAll(() => {
  server.close();
});
