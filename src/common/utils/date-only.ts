import { BusinessRuleException } from './exceptions';

export const BUSINESS_TIME_ZONE = 'Asia/Jakarta';

export function parseDateOnlyUtc(value: string, label = 'date'): Date {
  const dateKey = value.slice(0, 10);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    throw new BusinessRuleException(`Invalid ${label} format`);
  }

  const parsed = new Date(`${dateKey}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new BusinessRuleException(`Invalid ${label} value`);
  }

  return parsed;
}

export function toDateKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function getDateKeyInTimeZone(
  value = new Date(),
  timeZone = BUSINESS_TIME_ZONE,
): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);

  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;

  if (!year || !month || !day) {
    throw new BusinessRuleException('Invalid business date value');
  }

  return `${year}-${month}-${day}`;
}

export function getTodayDateKey(): string {
  return getDateKeyInTimeZone();
}

export function getTodayDateOnlyUtc(): Date {
  return parseDateOnlyUtc(getTodayDateKey(), 'today');
}

export function startOfWeekMondayUtc(dateKey: string): Date {
  const date = parseDateOnlyUtc(dateKey);
  const dayIndex = date.getUTCDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const offset = dayIndex === 0 ? 6 : dayIndex - 1;
  return new Date(date.getTime() - offset * 24 * 60 * 60 * 1000);
}

export function endOfWeekMondayUtc(dateKey: string): Date {
  const start = startOfWeekMondayUtc(dateKey);
  return new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000 - 1);
}

export function startOfMonthUtc(dateKey: string): Date {
  const [year, month] = dateKey.slice(0, 10).split('-').map(Number);
  return new Date(`${year}-${String(month).padStart(2, '0')}-01T00:00:00.000Z`);
}

export function endOfMonthUtc(dateKey: string): Date {
  const [year, month] = dateKey.slice(0, 10).split('-').map(Number);
  const nextMonth = new Date(Date.UTC(year!, month!, 1));
  return new Date(nextMonth.getTime() - 1);
}
