import {
  EngineShiftDefinition,
  matchDailyAttendance
} from "../src/attendance/shift-matching.engine";

describe("matchDailyAttendance", () => {
  const definitions: EngineShiftDefinition[] = [
    { id: "morning", shiftType: "MORNING", label: "Matin", startTime: "06:00", endTime: "15:00", spansMidnight: false, marginMinutes: 90 },
    { id: "evening", shiftType: "EVENING", label: "Soir", startTime: "15:00", endTime: "23:00", spansMidnight: false, marginMinutes: 90 },
    { id: "night", shiftType: "NIGHT", label: "Nuit", startTime: "23:00", endTime: "06:00", spansMidnight: true, marginMinutes: 120 },
    { id: "flexible", shiftType: "FLEXIBLE", label: "Normal", startTime: null, endTime: null, spansMidnight: false, marginMinutes: 0 },
    { id: "repos", shiftType: "REPOS", label: "Repos", startTime: null, endTime: null, spansMidnight: false, marginMinutes: 0 }
  ];

  const punch = (id: string, employeeId: string, punchTime: string) => ({
    id,
    employeeId,
    punchTime: new Date(punchTime)
  });

  it("rattache un shift de nuit assigne entre J 23h et J+1 06h", () => {
    const results = matchDailyAttendance({
      definitions,
      from: "2026-07-20",
      to: "2026-07-21",
      assignments: [{ employeeId: "e1", date: "2026-07-20", shiftDefinitionId: "night", assignedVia: "individual", sourceGroupId: null }],
      punches: [
        punch("p1", "e1", "2026-07-20T23:04:00"),
        punch("p2", "e1", "2026-07-21T06:02:00")
      ]
    });

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      workDate: "2026-07-20",
      shiftType: "NIGHT",
      source: "assigned",
      status: "complete",
      entryPunch: expect.objectContaining({ id: "p1" }),
      exitPunch: expect.objectContaining({ id: "p2" })
    });
  });

  it("deduit un shift de nuit sans affectation quand le premier pointage est le soir et la sortie avant 08h", () => {
    const results = matchDailyAttendance({
      definitions,
      from: "2026-07-20",
      to: "2026-07-21",
      assignments: [],
      punches: [
        punch("p1", "e1", "2026-07-20T22:50:00"),
        punch("p2", "e1", "2026-07-21T05:55:00")
      ]
    });

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      workDate: "2026-07-20",
      shiftType: "NIGHT",
      source: "fallback",
      status: "complete"
    });
  });

  it("traite un horaire flexible avec premiere et derniere pointe de la journee", () => {
    const results = matchDailyAttendance({
      definitions,
      from: "2026-07-20",
      to: "2026-07-20",
      assignments: [{ employeeId: "e1", date: "2026-07-20", shiftDefinitionId: "flexible", assignedVia: "individual", sourceGroupId: null }],
      punches: [
        punch("p1", "e1", "2026-07-20T09:00:00"),
        punch("p2", "e1", "2026-07-20T12:00:00"),
        punch("p3", "e1", "2026-07-20T17:30:00")
      ]
    });

    expect(results[0]).toMatchObject({
      shiftType: "FLEXIBLE",
      entryPunch: expect.objectContaining({ id: "p1" }),
      exitPunch: expect.objectContaining({ id: "p3" }),
      punchCount: 3,
      status: "complete"
    });
  });

  it("signale un service incomplet quand il manque la sortie", () => {
    const results = matchDailyAttendance({
      definitions,
      from: "2026-07-20",
      to: "2026-07-20",
      assignments: [{ employeeId: "e1", date: "2026-07-20", shiftDefinitionId: "morning", assignedVia: "individual", sourceGroupId: null }],
      punches: [punch("p1", "e1", "2026-07-20T06:12:00")]
    });

    expect(results[0]).toMatchObject({
      shiftType: "MORNING",
      status: "incomplete",
      exitPunch: null
    });
  });

  it("ne reutilise pas la sortie du lendemain matin comme entree du service suivant", () => {
    const results = matchDailyAttendance({
      definitions,
      from: "2026-07-20",
      to: "2026-07-22",
      assignments: [],
      punches: [
        punch("n1-in", "e1", "2026-07-20T23:00:00"),
        punch("n1-out", "e1", "2026-07-21T06:00:00"),
        punch("n2-in", "e1", "2026-07-21T23:05:00"),
        punch("n2-out", "e1", "2026-07-22T05:58:00")
      ]
    });

    expect(results.map(result => result.workDate)).toEqual(["2026-07-20", "2026-07-21"]);
    expect(results[1].entryPunch.id).toBe("n2-in");
    expect(results[1].exitPunch?.id).toBe("n2-out");
  });

  it("affiche un pointage seul sur un jour repos sans preuve de sortie", () => {
    const results = matchDailyAttendance({
      definitions,
      from: "2026-07-20",
      to: "2026-07-20",
      assignments: [{ employeeId: "e1", date: "2026-07-20", shiftDefinitionId: "repos", assignedVia: "individual", sourceGroupId: null }],
      punches: [punch("p1", "e1", "2026-07-20T07:00:00")]
    });

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      workDate: "2026-07-20",
      shiftType: "MORNING",
      source: "fallback",
      status: "incomplete",
      entryPunch: expect.objectContaining({ id: "p1" }),
      exitPunch: null
    });
  });

  it("affiche un jour repos quand deux pointages reels prouvent un service travaille", () => {
    const results = matchDailyAttendance({
      definitions,
      from: "2026-08-01",
      to: "2026-08-01",
      assignments: [{ employeeId: "e1", date: "2026-08-01", shiftDefinitionId: "repos", assignedVia: "group", sourceGroupId: "g1" }],
      punches: [
        punch("p1", "e1", "2026-08-01T14:53:00"),
        punch("p2", "e1", "2026-08-01T23:08:00")
      ]
    });

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      workDate: "2026-08-01",
      shiftType: "EVENING",
      source: "fallback",
      status: "complete",
      punchCount: 2
    });
  });

  it("ne rattache pas un punch de repos au matin suivant si le planning ne dit pas nuit", () => {
    const results = matchDailyAttendance({
      definitions,
      from: "2026-08-01",
      to: "2026-08-02",
      assignments: [
        { employeeId: "e1", date: "2026-08-01", shiftDefinitionId: "repos", assignedVia: "group", sourceGroupId: "g1" },
        { employeeId: "e1", date: "2026-08-02", shiftDefinitionId: "morning", assignedVia: "group", sourceGroupId: "g1" }
      ],
      punches: [
        punch("p1", "e1", "2026-08-01T23:06:00"),
        punch("p2", "e1", "2026-08-02T06:41:00")
      ]
    });

    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({
      workDate: "2026-08-01",
      shiftType: "NIGHT",
      source: "fallback",
      status: "incomplete",
      punchCount: 1,
      entryPunch: expect.objectContaining({ id: "p1" }),
      exitPunch: null
    });
    expect(results[1]).toMatchObject({
      workDate: "2026-08-02",
      shiftType: "MORNING",
      source: "assigned",
      status: "incomplete",
      punchCount: 1,
      entryPunch: expect.objectContaining({ id: "p2" }),
      exitPunch: null
    });
  });

  it("rattache la sortie du matin suivant quand un shift soir commence tard le soir", () => {
    const results = matchDailyAttendance({
      definitions,
      from: "2026-07-20",
      to: "2026-07-21",
      assignments: [{ employeeId: "e1", date: "2026-07-20", shiftDefinitionId: "evening", assignedVia: "group", sourceGroupId: "g1" }],
      punches: [
        punch("p1", "e1", "2026-07-20T22:53:00"),
        punch("p2", "e1", "2026-07-21T06:12:00")
      ]
    });

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      workDate: "2026-07-20",
      shiftType: "EVENING",
      status: "complete",
      entryPunch: expect.objectContaining({ id: "p1" }),
      exitPunch: expect.objectContaining({ id: "p2" })
    });
  });
});
