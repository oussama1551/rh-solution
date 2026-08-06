import { DayOfWeek } from "@prisma/client";

export function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function parseDateKey(dateKey: string): Date {
  return new Date(`${dateKey}T00:00:00.000Z`);
}

export function addDays(dateKey: string, days: number): string {
  const date = parseDateKey(dateKey);
  date.setUTCDate(date.getUTCDate() + days);
  return toDateKey(date);
}

export function enumerateDateKeys(startDate: string, endDate: string): string[] {
  const dates: string[] = [];

  for (let current = startDate; current <= endDate; current = addDays(current, 1)) {
    dates.push(current);
  }

  return dates;
}

export function dayOfWeekForDate(dateKey: string): DayOfWeek {
  const day = parseDateKey(dateKey).getUTCDay();
  return [
    DayOfWeek.SUNDAY,
    DayOfWeek.MONDAY,
    DayOfWeek.TUESDAY,
    DayOfWeek.WEDNESDAY,
    DayOfWeek.THURSDAY,
    DayOfWeek.FRIDAY,
    DayOfWeek.SATURDAY
  ][day];
}

export function parseTimeToMinutes(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

export function plannedDateTime(dateKey: string, time: string): Date {
  const date = parseDateKey(dateKey);
  date.setUTCMinutes(parseTimeToMinutes(time));
  return date;
}

export function minutesBetween(start: Date, end: Date): number {
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60_000));
}
