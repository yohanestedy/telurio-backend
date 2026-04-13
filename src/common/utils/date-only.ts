import dayjs from 'dayjs';
import { BusinessRuleException } from './exceptions';

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

export function getTodayDateKey(): string {
  return dayjs().format('YYYY-MM-DD');
}

export function getTodayDateOnlyUtc(): Date {
  return parseDateOnlyUtc(getTodayDateKey(), 'today');
}
