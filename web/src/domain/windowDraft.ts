// The editable form of a weekly window (a shift or a coverage range): times stay as typed text.
import type { WindowView } from '@shared/api-types.ts';

import { compareWindows } from './time.ts';

export type WindowDraft = {
  /** Stable identity of the row while the list is edited. */
  readonly key: number;
  readonly weekday: number;
  readonly start: string;
  readonly end: string;
};

const MONDAY = 1;
let nextKey = 0;

export function newWindowDraft(window: WindowView): WindowDraft {
  nextKey += 1;
  return { key: nextKey, ...window };
}

export function mondayDraft({ start, end }: Pick<WindowView, 'start' | 'end'>): WindowDraft {
  return newWindowDraft({ weekday: MONDAY, start, end });
}

/** The rows of a saved list, Monday first. The service does not promise an order. */
export function toWindowDrafts(windows: readonly WindowView[]): WindowDraft[] {
  return windows.toSorted(compareWindows).map(newWindowDraft);
}

export function toWindowBody({ weekday, start, end }: WindowDraft): WindowView {
  return { weekday, start: start.trim(), end: end.trim() };
}
