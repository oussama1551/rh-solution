import { ShiftEngineService } from "../src/shifts/shift-engine.service";
import {
  DailyAttendanceStatus,
  DayOfWeek,
  PunchDirection,
  PunchShiftStatus,
  ShiftAssignmentLike,
  ShiftLike
} from "../src/shifts/shift-engine.types";

describe("ShiftEngineService", () => {
  const service = new ShiftEngineService();

  const dayShift: ShiftLike = {
    id: "shift-day",
    startTime: "08:00",
    endTime: "16:00",
    spansMidnight: false,
    applicableDays: [DayOfWeek.Monday, DayOfWeek.Tuesday, DayOfWeek.Wednesday, DayOfWeek.Thursday, DayOfWeek.Friday],
    toleranceBeforeMinutes: 15,
    toleranceAfterMinutes: 15,
    isActive: true
  };

  const nightShift: ShiftLike = {
    id: "shift-night",
    startTime: "22:00",
    endTime: "06:00",
    spansMidnight: true,
    applicableDays: [DayOfWeek.Monday, DayOfWeek.Tuesday, DayOfWeek.Wednesday, DayOfWeek.Thursday, DayOfWeek.Friday],
    toleranceBeforeMinutes: 15,
    toleranceAfterMinutes: 15,
    isActive: true
  };

  const assignment = (shift: ShiftLike): ShiftAssignmentLike => ({
    id: `assignment-${shift.id}`,
    employeeId: "employee-1",
    validFrom: new Date("2026-07-01T00:00:00.000Z"),
    validTo: null,
    shift
  });

  it("rattache un shift de jour classique à la date calendaire du pointage", () => {
    const match = service.matchPunchToShift(
      "employee-1",
      new Date("2026-07-20T08:05:00.000Z"),
      PunchDirection.CheckIn,
      [assignment(dayShift)]
    );

    expect(match).toMatchObject({
      shiftId: "shift-day",
      shiftDate: "2026-07-20",
      status: PunchShiftStatus.Late
    });
  });

  it("marque un pointage exactement à l'heure comme à l'heure", () => {
    const match = service.matchPunchToShift(
      "employee-1",
      new Date("2026-07-20T08:00:00.000Z"),
      PunchDirection.CheckIn,
      [assignment(dayShift)]
    );

    expect(match).toMatchObject({
      shiftId: "shift-day",
      shiftDate: "2026-07-20",
      status: PunchShiftStatus.OnTime
    });
  });

  it("rattache un check-in de nuit à la date du début du shift", () => {
    const match = service.matchPunchToShift(
      "employee-1",
      new Date("2026-07-20T22:03:00.000Z"),
      PunchDirection.CheckIn,
      [assignment(nightShift)]
    );

    expect(match).toMatchObject({
      shiftId: "shift-night",
      shiftDate: "2026-07-20",
      status: PunchShiftStatus.Late
    });
  });

  it("rattache un pointage juste avant minuit au shift de la même date", () => {
    const match = service.matchPunchToShift(
      "employee-1",
      new Date("2026-07-20T23:58:00.000Z"),
      PunchDirection.CheckIn,
      [assignment(nightShift)]
    );

    expect(match).toMatchObject({
      shiftId: "shift-night",
      shiftDate: "2026-07-20"
    });
  });

  it("rattache un check-out juste après minuit au shift de la veille", () => {
    const match = service.matchPunchToShift(
      "employee-1",
      new Date("2026-07-21T00:04:00.000Z"),
      PunchDirection.CheckOut,
      [assignment(nightShift)]
    );

    expect(match).toMatchObject({
      shiftId: "shift-night",
      shiftDate: "2026-07-20",
      status: PunchShiftStatus.OutOfWindow
    });
  });

  it("marque un check-out de nuit dans la marge de sortie comme en avance", () => {
    const match = service.matchPunchToShift(
      "employee-1",
      new Date("2026-07-21T05:55:00.000Z"),
      PunchDirection.CheckOut,
      [assignment(nightShift)]
    );

    expect(match).toMatchObject({
      shiftId: "shift-night",
      shiftDate: "2026-07-20",
      status: PunchShiftStatus.Early
    });
  });

  it("marque un pointage largement hors-créneau sans perdre le shift assigné", () => {
    const match = service.matchPunchToShift(
      "employee-1",
      new Date("2026-07-20T12:00:00.000Z"),
      PunchDirection.CheckIn,
      [assignment(nightShift)]
    );

    expect(match).toMatchObject({
      shiftId: "shift-night",
      shiftDate: "2026-07-20",
      status: PunchShiftStatus.OutOfWindow
    });
  });

  it("signale une absence de check-out pour une journée avec check-in seul", () => {
    const summary = service.calculateDailyAttendance("shift-night", "2026-07-20", [
      { direction: PunchDirection.CheckIn }
    ]);

    expect(summary).toEqual({
      shiftId: "shift-night",
      shiftDate: "2026-07-20",
      status: DailyAttendanceStatus.MissingCheckOut
    });
  });

  it("calcule automatiquement le flag spans_midnight depuis les heures", () => {
    expect(service.computeSpansMidnight("22:00", "06:00")).toBe(true);
    expect(service.computeSpansMidnight("08:00", "16:00")).toBe(false);
  });
});
