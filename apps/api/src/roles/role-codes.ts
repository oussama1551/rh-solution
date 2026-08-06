export const RoleCode = {
  Admin: "ADMIN",
  IT: "IT",
  DRH: "DRH",
  GRH: "GRH",
  ResponsableDepartement: "RESPONSABLE_DEPARTEMENT",
  HR: "HR",
  Supervisor: "SUPERVISOR",
  ReadOnly: "READ_ONLY"
} as const;

export type RoleCode = (typeof RoleCode)[keyof typeof RoleCode];
