export type BioTimeListResponse<T> = {
  count?: number;
  next?: string | null;
  previous?: string | null;
  results?: T[];
  data?: T[];
};

export type BioTimeRecord = Record<string, unknown>;

export type BioTimeSyncCounts = {
  employeesCount: number;
  resignsCount: number;
  devicesCount: number;
  punchesCount: number;
  backfillPunchesCount?: number;
  backfillRowsCount?: number;
  employeePunchSweepCount?: number;
  employeePunchSweepRowsCount?: number;
  employeePunchSweepEmployeesCount?: number;
  reactivatedCount?: number;
};

export type ProgressCallback = (page: number, totalRows: number) => void;

export type SyncCursor = {
  employeesSince?: string;
  resignsSince?: string;
  devicesSince?: string;
  punchesSince?: string;
};
