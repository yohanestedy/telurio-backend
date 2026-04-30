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
