import { Injectable } from "@nestjs/common";
import {
  DailyAttendanceStatus,
  DailyAttendanceSummary,
  DayOfWeek,
  MatchedPunch,
  PunchDirection,
  PunchShiftStatus,
  ShiftAssignmentLike,
  ShiftLike
} from "./shift-engine.types";

const MINUTES_PER_DAY = 24 * 60;

@Injectable()
export class ShiftEngineService {
  computeSpansMidnight(startTime: string, endTime: string): boolean {
    return parseTimeToMinutes(endTime) < parseTimeToMinutes(startTime);
  }

  matchPunchToShift(
    employeeId: string,
    punchTime: Date,
    direction: PunchDirection,
    assignments: ShiftAssignmentLike[]
  ): MatchedPunch | null {
    const candidates = assignments
      .filter(assignment => assignment.employeeId === employeeId)
      .filter(assignment => assignment.shift.isActive !== false)
      .map(assignment => this.matchAssignment(assignment, punchTime, direction))
      .filter((match): match is MatchedPunch => match !== null);

    if (candidates.length === 0) {
      return null;
    }

    // Si plusieurs shifts sont possibles, on prend celui dont le pointage est le plus proche du début/fin planifié.
    return candidates.sort((left, right) => scoreMatch(left, punchTime) - scoreMatch(right, punchTime))[0];
  }

  calculatePunchStatus(
    punchTime: Date,
    plannedStart: Date,
    plannedEnd: Date,
    direction: PunchDirection,
    toleranceBeforeMinutes = 15,
    toleranceAfterMinutes = 15
  ): PunchShiftStatus {
    if (direction === PunchDirection.CheckIn) {
      const windowStart = addMinutes(plannedStart, -toleranceBeforeMinutes);
      const windowEnd = addMinutes(plannedStart, toleranceAfterMinutes);

      if (punchTime.getTime() < windowStart.getTime() || punchTime.getTime() > windowEnd.getTime()) {
        return PunchShiftStatus.OutOfWindow;
      }

      if (punchTime.getTime() === plannedStart.getTime()) {
        return PunchShiftStatus.OnTime;
      }

      if (punchTime.getTime() < plannedStart.getTime()) {
        return PunchShiftStatus.Early;
      }

      return PunchShiftStatus.Late;
    }

    if (direction === PunchDirection.CheckOut) {
      const windowStart = addMinutes(plannedEnd, -toleranceBeforeMinutes);
      const windowEnd = addMinutes(plannedEnd, toleranceAfterMinutes);

      if (punchTime.getTime() < windowStart.getTime() || punchTime.getTime() > windowEnd.getTime()) {
        return PunchShiftStatus.OutOfWindow;
      }

      if (punchTime.getTime() === plannedEnd.getTime()) {
        return PunchShiftStatus.OnTime;
      }

      if (punchTime.getTime() < plannedEnd.getTime()) {
        return PunchShiftStatus.Early;
      }

      return PunchShiftStatus.Late;
    }

    return PunchShiftStatus.OnTime;
  }

  calculateDailyAttendance(
    shiftId: string,
    shiftDate: string,
    punches: Array<{ direction: PunchDirection }>
  ): DailyAttendanceSummary {
    const hasCheckIn = punches.some(punch => punch.direction === PunchDirection.CheckIn);
    const hasCheckOut = punches.some(punch => punch.direction === PunchDirection.CheckOut);

    if (hasCheckIn && hasCheckOut) {
      return { shiftId, shiftDate, status: DailyAttendanceStatus.Complete };
    }

    if (hasCheckIn) {
      return { shiftId, shiftDate, status: DailyAttendanceStatus.MissingCheckOut };
    }

    if (hasCheckOut) {
      return { shiftId, shiftDate, status: DailyAttendanceStatus.MissingCheckIn };
    }

    return { shiftId, shiftDate, status: DailyAttendanceStatus.MissingBoth };
  }

  private matchAssignment(
    assignment: ShiftAssignmentLike,
    punchTime: Date,
    direction: PunchDirection
  ): MatchedPunch | null {
    const shiftDate = resolveShiftDate(assignment.shift, punchTime, direction);

    if (!isAssignmentValidOnDate(assignment, shiftDate)) {
      return null;
    }

    if (!assignment.shift.applicableDays.includes(dayOfWeekForDate(shiftDate))) {
      return null;
    }

    const plannedStart = dateTimeFromShiftDate(shiftDate, assignment.shift.startTime);
    const plannedEnd = dateTimeFromShiftDate(
      assignment.shift.spansMidnight ? addDays(shiftDate, 1) : shiftDate,
      assignment.shift.endTime
    );
    const toleranceBefore = assignment.shift.toleranceBeforeMinutes ?? 15;
    const toleranceAfter = assignment.shift.toleranceAfterMinutes ?? 15;
    const windowStart = addMinutes(plannedStart, -toleranceBefore);
    const windowEnd = addMinutes(plannedEnd, toleranceAfter);

    return {
      assignmentId: assignment.id,
      shiftId: assignment.shift.id,
      shiftDate,
      direction,
      status: this.calculatePunchStatus(punchTime, plannedStart, plannedEnd, direction, toleranceBefore, toleranceAfter),
      windowStart,
      plannedStart,
      plannedEnd,
      windowEnd
    };
  }
}

export function resolveShiftDate(shift: ShiftLike, punchTime: Date, direction: PunchDirection): string {
  const punchDate = toDateKey(punchTime);

  if (!shift.spansMidnight) {
    return punchDate;
  }

  const startMinutes = parseTimeToMinutes(shift.startTime);
  const endMinutes = parseTimeToMinutes(shift.endTime);
  const toleranceBefore = shift.toleranceBeforeMinutes ?? 15;
  const toleranceAfter = shift.toleranceAfterMinutes ?? 15;
  const punchMinutes = punchTime.getUTCHours() * 60 + punchTime.getUTCMinutes();

  // Pour un shift de nuit, le pointage du matin appartient au shift de la veille.
  if (punchMinutes <= endMinutes + toleranceAfter) {
    return addDays(punchDate, -1);
  }

  // Un check-in en fin de journée, même légèrement avant l'heure, garde la date du jour.
  if (punchMinutes >= normalizeMinute(startMinutes - toleranceBefore)) {
    return punchDate;
  }

  // Hors créneau: on garde une règle stable selon le sens du pointage pour pouvoir diagnostiquer l'anomalie.
  return direction === PunchDirection.CheckOut ? addDays(punchDate, -1) : punchDate;
}

export function parseTimeToMinutes(value: string): number {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);

  if (!match) {
    throw new Error(`Heure de shift invalide: ${value}. Format attendu HH:mm.`);
  }

  return Number(match[1]) * 60 + Number(match[2]);
}

function normalizeMinute(value: number): number {
  return ((value % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
}

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(dateKey: string, days: number): string {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return toDateKey(date);
}

function dateTimeFromShiftDate(dateKey: string, time: string): Date {
  const minutes = parseTimeToMinutes(time);
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCMinutes(minutes);
  return date;
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

function dayOfWeekForDate(dateKey: string): DayOfWeek {
  const day = new Date(`${dateKey}T00:00:00.000Z`).getUTCDay();
  return [
    DayOfWeek.Sunday,
    DayOfWeek.Monday,
    DayOfWeek.Tuesday,
    DayOfWeek.Wednesday,
    DayOfWeek.Thursday,
    DayOfWeek.Friday,
    DayOfWeek.Saturday
  ][day];
}

function isAssignmentValidOnDate(assignment: ShiftAssignmentLike, shiftDate: string): boolean {
  const validFrom = toDateKey(assignment.validFrom);
  const validTo = assignment.validTo ? toDateKey(assignment.validTo) : null;

  return shiftDate >= validFrom && (!validTo || shiftDate <= validTo);
}

function scoreMatch(match: MatchedPunch, punchTime: Date): number {
  const target =
    match.direction === PunchDirection.CheckOut
      ? match.plannedEnd.getTime()
      : match.plannedStart.getTime();

  return Math.abs(punchTime.getTime() - target);
}
