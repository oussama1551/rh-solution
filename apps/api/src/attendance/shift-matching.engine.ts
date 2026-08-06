export type EngineShiftType = "MORNING" | "EVENING" | "NIGHT" | "FLEXIBLE" | "REPOS";
export type EngineAssignedVia = "individual" | "group";
export type EngineSource = "assigned" | "fallback";
export type EngineStatus = "complete" | "incomplete";

export type EngineShiftDefinition = {
  id: string;
  shiftType: EngineShiftType;
  label: string;
  startTime: string | null;
  endTime: string | null;
  spansMidnight: boolean;
  marginMinutes: number;
};

export type EngineAssignment = {
  employeeId: string;
  date: string;
  shiftDefinitionId: string;
  assignedVia: EngineAssignedVia;
  sourceGroupId: string | null;
  sourceGroupName?: string | null;
};

export type EnginePunch = {
  id: string;
  employeeId: string;
  punchTime: Date;
};

export type EngineDailyResult = {
  id: string;
  employeeId: string;
  workDate: string;
  shiftType: EngineShiftType;
  shiftLabel: string;
  source: EngineSource;
  assignedVia: EngineAssignedVia | null;
  sourceGroupId: string | null;
  sourceGroupName: string | null;
  status: EngineStatus;
  entryPunch: EnginePunch;
  exitPunch: EnginePunch | null;
  punchCount: number;
  workedHours: number;
};

export function matchDailyAttendance(input: {
  punches: EnginePunch[];
  assignments: EngineAssignment[];
  definitions: EngineShiftDefinition[];
  from: string;
  to: string;
  allowSameDayFallbackExit?: boolean;
  marginOverridesByEmployeeId?: Record<string, number | undefined>;
}) {
  const definitionsById = new Map(input.definitions.map(definition => [definition.id, definition]));
  const definitionsByType = new Map(input.definitions.map(definition => [definition.shiftType, definition]));
  const assignmentsByEmployeeDate = new Map(input.assignments.map(assignment => [`${assignment.employeeId}:${assignment.date}`, assignment]));
  const punchesByEmployee = groupBy(input.punches, punch => punch.employeeId);
  const usedPunchIds = new Set<string>();
  const results: EngineDailyResult[] = [];
  const serviceDates = datesBetween(input.from, input.to);

  for (const [employeeId, employeePunches] of punchesByEmployee.entries()) {
    const sortedPunches = [...employeePunches].sort((left, right) => left.punchTime.getTime() - right.punchTime.getTime());
    const employeeMarginOverride = input.marginOverridesByEmployeeId?.[employeeId];
    const employeeDefinitionsById = employeeMarginOverride ? overrideDefinitionMargins(definitionsById, employeeMarginOverride) : definitionsById;
    const employeeDefinitionsByType = employeeMarginOverride ? overrideDefinitionMargins(definitionsByType, employeeMarginOverride) : definitionsByType;

    for (const workDate of serviceDates) {
      const assignment = assignmentsByEmployeeDate.get(`${employeeId}:${workDate}`) || null;
      const assignedDefinition = assignment
        ? employeeDefinitionsById.get(assignment.shiftDefinitionId) || employeeDefinitionsByType.get("FLEXIBLE")
        : null;
      const effectiveAssignment = assignedDefinition?.shiftType === "REPOS" ? null : assignment;
      const definition = assignedDefinition?.shiftType === "REPOS"
        ? hasWorkedRestDayEvidence(workDate, sortedPunches, usedPunchIds)
          ? inferDefinition(workDate, sortedPunches, usedPunchIds, employeeDefinitionsByType)
          : null
        : assignedDefinition || inferDefinition(workDate, sortedPunches, usedPunchIds, employeeDefinitionsByType);

      if (!definition) continue;

      const selected = selectPunchesForDefinition(workDate, definition, sortedPunches, usedPunchIds, {
        sameDayOnly: assignedDefinition?.shiftType === "REPOS",
        allowNextMorningExit: assignedDefinition?.shiftType !== "REPOS",
        allowSameDayFallbackExit: Boolean(input.allowSameDayFallbackExit)
      });
      if (!selected.entry) continue;

      usedPunchIds.add(selected.entry.id);
      if (selected.exit) usedPunchIds.add(selected.exit.id);

      const workedHours = selected.exit
        ? roundHours((selected.exit.punchTime.getTime() - selected.entry.punchTime.getTime()) / 3_600_000)
        : 0;

      results.push({
        id: `${employeeId}:${workDate}`,
        employeeId,
        workDate,
        shiftType: definition.shiftType,
        shiftLabel: definition.label,
        source: effectiveAssignment ? "assigned" : "fallback",
        assignedVia: effectiveAssignment?.assignedVia || null,
        sourceGroupId: effectiveAssignment?.sourceGroupId || null,
        sourceGroupName: effectiveAssignment?.sourceGroupName || null,
        status: selected.exit ? "complete" : "incomplete",
        entryPunch: selected.entry,
        exitPunch: selected.exit,
        punchCount: selected.punchCount,
        workedHours
      });
    }
  }

  return results;
}

function hasWorkedRestDayEvidence(workDate: string, punches: EnginePunch[], usedPunchIds: Set<string>) {
  return punches.some(punch => !usedPunchIds.has(punch.id) && localDateKey(punch.punchTime) === workDate);
}

function inferDefinition(
  workDate: string,
  punches: EnginePunch[],
  usedPunchIds: Set<string>,
  definitionsByType: Map<EngineShiftType, EngineShiftDefinition>
) {
  const dayPunches = punches
    .filter(punch => !usedPunchIds.has(punch.id))
    .filter(punch => localDateKey(punch.punchTime) === workDate)
    .sort((left, right) => left.punchTime.getTime() - right.punchTime.getTime());

  if (!dayPunches.length) return null;

  const firstMinutes = localMinutes(dayPunches[0].punchTime);
  const nextMorningPunch = punches.some(punch =>
    !usedPunchIds.has(punch.id)
    && localDateKey(punch.punchTime) === addDaysKey(workDate, 1)
    && localMinutes(punch.punchTime) <= 8 * 60
  );

  if ((firstMinutes >= 18 * 60 && nextMorningPunch) || near(firstMinutes, 23 * 60, definitionsByType.get("NIGHT")?.marginMinutes || 120)) {
    return definitionsByType.get("NIGHT") || null;
  }

  if (near(firstMinutes, 6 * 60, definitionsByType.get("MORNING")?.marginMinutes || 90)) {
    return definitionsByType.get("MORNING") || null;
  }

  if (near(firstMinutes, 15 * 60, definitionsByType.get("EVENING")?.marginMinutes || 90)) {
    return definitionsByType.get("EVENING") || null;
  }

  return definitionsByType.get("FLEXIBLE") || null;
}

function selectPunchesForDefinition(
  workDate: string,
  definition: EngineShiftDefinition,
  punches: EnginePunch[],
  usedPunchIds: Set<string>,
  options: { sameDayOnly?: boolean; allowNextMorningExit?: boolean; allowSameDayFallbackExit?: boolean } = {}
) {
  const available = punches.filter(punch => !usedPunchIds.has(punch.id));
  if (definition.shiftType === "REPOS") {
    return { entry: null, exit: null, punchCount: 0 };
  }

  const inWindow = options.sameDayOnly
    ? available.filter(punch => localDateKey(punch.punchTime) === workDate)
    : definition.shiftType === "FLEXIBLE"
    ? available.filter(punch => localDateKey(punch.punchTime) === workDate)
    : available.filter(punch => isInDefinitionWindow(punch.punchTime, workDate, definition));

  const sorted = inWindow.sort((left, right) => left.punchTime.getTime() - right.punchTime.getTime());
  const entry = sorted[0] || null;
  let exit = sorted.length > 1 ? sorted[sorted.length - 1] : null;
  let punchCount = sorted.length;

  if (options.allowSameDayFallbackExit && !exit && entry && !options.sameDayOnly) {
    const sameDayFallbackExit = available
      .filter(punch => punch.id !== entry.id)
      .filter(punch => localDateKey(punch.punchTime) === workDate)
      .filter(punch => punch.punchTime.getTime() > entry.punchTime.getTime())
      .sort((left, right) => right.punchTime.getTime() - left.punchTime.getTime())[0] || null;

    if (sameDayFallbackExit) {
      exit = sameDayFallbackExit;
      punchCount = sorted.some(punch => punch.id === sameDayFallbackExit.id) ? sorted.length : sorted.length + 1;
    }
  }

  if (options.allowNextMorningExit !== false && entry && definition.shiftType === "EVENING" && localMinutes(entry.punchTime) >= 18 * 60) {
    const nextMorningExit = available
      .filter(punch => punch.id !== entry.id)
      .filter(punch => localDateKey(punch.punchTime) === addDaysKey(workDate, 1))
      .filter(punch => localMinutes(punch.punchTime) <= 8 * 60)
      .sort((left, right) => left.punchTime.getTime() - right.punchTime.getTime())[0] || null;

    if (nextMorningExit && (!exit || nextMorningExit.punchTime.getTime() > exit.punchTime.getTime())) {
      exit = nextMorningExit;
      punchCount = sorted.some(punch => punch.id === nextMorningExit.id) ? sorted.length : sorted.length + 1;
    }
  }

  return { entry, exit, punchCount };
}

function isInDefinitionWindow(punchTime: Date, workDate: string, definition: EngineShiftDefinition) {
  if (!definition.startTime || !definition.endTime) return localDateKey(punchTime) === workDate;
  const margin = definition.marginMinutes;
  const start = dateAtMinutes(workDate, parseTime(definition.startTime) - margin);
  const endBaseDate = definition.spansMidnight ? addDaysKey(workDate, 1) : workDate;
  const end = dateAtMinutes(endBaseDate, parseTime(definition.endTime) + margin);
  return punchTime.getTime() >= start.getTime() && punchTime.getTime() <= end.getTime();
}

function dateAtMinutes(dateKey: string, minutes: number) {
  const base = new Date(`${dateKey}T00:00:00`);
  base.setMinutes(minutes);
  return base;
}

function parseTime(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function near(value: number, target: number, margin: number) {
  return Math.abs(value - target) <= margin;
}

function datesBetween(from: string, to: string) {
  const dates: string[] = [];
  let cursor = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  while (cursor <= end) {
    dates.push(localDateKey(cursor));
    cursor = addDays(cursor, 1);
  }
  return dates;
}

function addDaysKey(dateKey: string, days: number) {
  return localDateKey(addDays(new Date(`${dateKey}T00:00:00`), days));
}

function addDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function localDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function localMinutes(date: Date) {
  return date.getHours() * 60 + date.getMinutes();
}

function roundHours(value: number) {
  return Math.round(value * 100) / 100;
}

function groupBy<T>(items: T[], key: (item: T) => string) {
  const grouped = new Map<string, T[]>();
  for (const item of items) {
    const itemKey = key(item);
    grouped.set(itemKey, [...(grouped.get(itemKey) || []), item]);
  }
  return grouped;
}

function overrideDefinitionMargins<K>(definitions: Map<K, EngineShiftDefinition>, marginMinutes: number) {
  return new Map([...definitions.entries()].map(([key, definition]) => [
    key,
    { ...definition, marginMinutes }
  ]));
}
