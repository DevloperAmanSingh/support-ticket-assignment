// The pure time constants and validators that the wire schemas need. No clock, no database.

export const MINUTES_PER_HOUR = 60;
export const MINUTES_PER_DAY = 1440;
export const DAYS_PER_WEEK = 7;
export const MINUTES_PER_WEEK = MINUTES_PER_DAY * DAYS_PER_WEEK;
export const TIME_STEP_MINUTES = 5;

const MONDAY = 1;
const DATE_TEXT_LENGTH = 10;

export function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

export function clockTextToMinute(text: string): number {
  return Number(text.slice(0, 2)) * MINUTES_PER_HOUR + Number(text.slice(3, 5));
}

export function minuteToClockText(minute: number): string {
  const hours = Math.floor(minute / MINUTES_PER_HOUR);
  const minutes = minute % MINUTES_PER_HOUR;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export function isOnTimeStep(minute: number): boolean {
  return minute % TIME_STEP_MINUTES === 0;
}

export function isMondayDate(text: string): boolean {
  const date = new Date(`${text}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return false;
  return date.toISOString().slice(0, DATE_TEXT_LENGTH) === text && date.getUTCDay() === MONDAY;
}
