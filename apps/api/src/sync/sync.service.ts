import { BadRequestException, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Cron, CronExpression } from "@nestjs/schedule";
import { EmployeeStatus, NotificationType, Prisma, PunchShiftStatus, SyncStatus } from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import { AttendancePunchesService } from "../attendance/attendance-punches.service";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import { BioTimeClientService } from "./biotime-client.service";
import {
  dateField,
  departmentName,
  deviceStatus,
  employeeCode,
  employeeName,
  employeeSourceId,
  jsonPayload,
  ipAddress,
  punchDirection,
  resignEmployeeSourceId,
  stringField
} from "./biotime-mapper";
import { BioTimeRecord, BioTimeSyncCounts, ProgressCallback, SyncCursor } from "./biotime.types";

@Injectable()
export class SyncService implements OnModuleInit {
  private readonly logger = new Logger(SyncService.name);
  private running = false;
  private runningStartedAt: Date | null = null;
  private runningTrigger: string | null = null;
  private runSequence = 0;
  private lastRollingBackfillAt: Date | null = null;
  private lastEmployeePunchSweepAt: Date | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly biotime: BioTimeClientService,
    private readonly attendancePunches: AttendancePunchesService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
    private readonly notifications: NotificationsService
  ) {}

  async onModuleInit() {
    await this.failInterruptedRuns();
    if (String(this.config.get("BIOTIME_SYNC_ON_STARTUP") || "false").toLowerCase() === "true") {
      const state = await this.state();
      const staleMinutes = Number(this.config.get("BIOTIME_SYNC_STALE_MINUTES") || 10);

      if (!state.lastSuccessAt || Date.now() - state.lastSuccessAt.getTime() > staleMinutes * 60_000) {
        void this.run("startup").catch(error => this.logger.error(error));
      }
    }
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async scheduledTick() {
    await this.failTimedOutRuns();
    const interval = Number(this.config.get("BIOTIME_SYNC_INTERVAL_MINUTES") || 5);
    const state = await this.state();

    if (!state.lastAttemptAt || Date.now() - state.lastAttemptAt.getTime() >= interval * 60_000) {
      await this.run("scheduled");
    }
  }

  @Cron(process.env.BIOTIME_PUNCH_BACKFILL_CRON || "30 3 * * *")
  async scheduledPunchBackfill() {
    try {
      await this.backfillPunches(undefined, undefined, undefined, "scheduled_punch_backfill");
    } catch (error) {
      this.logger.error(`Backfill glissant BioTime échoué: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async state() {
    await this.failTimedOutRuns();
    const [lastSuccess, lastAttempt, running] = await Promise.all([
      this.prisma.syncLog.findFirst({ where: { status: SyncStatus.SUCCESS }, orderBy: { startedAt: "desc" } }),
      this.prisma.syncLog.findFirst({ orderBy: { startedAt: "desc" } }),
      this.prisma.syncLog.findFirst({ where: { status: SyncStatus.RUNNING }, orderBy: { startedAt: "desc" } })
    ]);

    const inMemoryRunning = this.running
      && (!this.runningStartedAt || Date.now() - this.runningStartedAt.getTime() < this.maxDurationMs());
    const lastAttemptFailed = lastAttempt?.status === SyncStatus.FAILED;

    return {
      connected: Boolean(lastSuccess) && !lastAttemptFailed,
      lastSuccessAt: lastSuccess?.finishedAt || lastSuccess?.startedAt || null,
      lastAttemptAt: lastAttempt?.startedAt || null,
      running: Boolean(running) || inMemoryRunning,
      lastError: lastAttemptFailed ? lastAttempt.errorMessage || "Dernière synchronisation échouée." : null,
      lastSuccess
    };
  }

  async history(limit = 50) {
    return this.prisma.syncLog.findMany({
      orderBy: { startedAt: "desc" },
      take: Math.min(Math.max(limit, 1), 200)
    });
  }

  async run(trigger: string, actorId?: string, options: { full?: boolean } = {}) {
    await this.failTimedOutRuns();

    if (this.running) {
      const runningLog = await this.prisma.syncLog.findFirst({ where: { status: SyncStatus.RUNNING }, orderBy: { startedAt: "desc" } });
      if (!runningLog) {
        this.logger.warn("État sync mémoire incohérent sans RUNNING en base: réinitialisation locale.");
        this.running = false;
        this.runningStartedAt = null;
        this.runningTrigger = null;
      }
    }

    if (this.running) {
      if (!options.full || !this.isBackgroundRun(this.runningTrigger)) {
        return this.prisma.syncLog.findFirst({ where: { status: SyncStatus.RUNNING }, orderBy: { startedAt: "desc" } });
      }

      await this.interruptBackgroundRunForManualSync();
    }

    this.running = true;
    this.runningStartedAt = new Date();
    this.runningTrigger = trigger;
    const sequence = ++this.runSequence;
    const log = await this.prisma.syncLog.create({ data: { trigger } });

    try {
      const cursor = await this.lastCursor();
      const counts = await this.withSyncTimeout(this.pullAll(cursor, options));
      this.logger.log(
        `Sync BioTime ${trigger}: ${counts.employeesCount} employé(s), ${counts.reactivatedCount || 0} réactivation(s), ${counts.resignsCount} démission(s), ${counts.devicesCount} terminal(aux), ${counts.punchesCount} pointage(s).`
      );
      const currentLog = await this.prisma.syncLog.findFirst({ where: { id: log.id } });
      if (currentLog && currentLog.status !== SyncStatus.RUNNING) {
        return currentLog;
      }

      const nextCursor = await this.computeCursor();
      const { reactivatedCount, backfillPunchesCount, backfillRowsCount, employeePunchSweepCount, employeePunchSweepRowsCount, employeePunchSweepEmployeesCount, ...logCounts } = counts;
      const updated = await this.prisma.syncLog.update({
        where: { id: log.id },
        data: {
          status: SyncStatus.SUCCESS,
          finishedAt: new Date(),
          ...logCounts,
          lastCursor: nextCursor as Prisma.InputJsonValue,
          metadata: {
            full: Boolean(options.full),
            reactivatedCount: reactivatedCount || 0,
            backfillPunchesCount: backfillPunchesCount || 0,
            backfillRowsCount: backfillRowsCount || 0,
            employeePunchSweepCount: employeePunchSweepCount || 0,
            employeePunchSweepRowsCount: employeePunchSweepRowsCount || 0,
            employeePunchSweepEmployeesCount: employeePunchSweepEmployeesCount || 0
          }
        }
      });

      await this.audit.record({
        userId: actorId,
        action: "sync.run",
        entityType: "sync_log",
        entityId: updated.id,
        after: updated
      });

      return updated;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(message);
      const currentLog = await this.prisma.syncLog.findFirst({ where: { id: log.id } });
      if (currentLog && currentLog.status !== SyncStatus.RUNNING) {
        return currentLog;
      }

      const failed = await this.prisma.syncLog.update({ where: { id: log.id }, data: { status: SyncStatus.FAILED, finishedAt: new Date(), errorMessage: message } });
      await this.notifications.notify(await this.notifications.adminItUserIds(), NotificationType.SYNC_ERROR, {
        title: "Synchronisation BioTime échouée",
        message,
        entityType: "sync_log",
        entityId: failed.id
      });
      return failed;
    } finally {
      if (this.runSequence === sequence) {
        this.running = false;
        this.runningStartedAt = null;
        this.runningTrigger = null;
      }
    }
  }

  private async waitForCurrentRun(timeoutMs = this.maxDurationMs()) {
    const startedAt = Date.now();

    while (this.running) {
      if (Date.now() - startedAt > timeoutMs) {
        throw new Error("Une synchronisation BioTime est déjà en cours depuis trop longtemps. Réessayez dans quelques instants.");
      }

      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  private async interruptBackgroundRunForManualSync() {
    await this.prisma.syncLog.updateMany({
      where: {
        status: SyncStatus.RUNNING,
        finishedAt: null,
        trigger: {
          in: ["startup", "scheduled"]
        }
      },
      data: {
        status: SyncStatus.FAILED,
        finishedAt: new Date(),
        errorMessage: "Interrompu par une synchronisation manuelle prioritaire"
      }
    });

    this.logger.warn("Synchronisation de fond interrompue pour lancer une synchronisation manuelle complète.");
    this.running = false;
    this.runningStartedAt = null;
    this.runningTrigger = null;
  }

  private isBackgroundRun(trigger: string | null) {
    return trigger === "startup" || trigger === "scheduled";
  }

  private async withSyncTimeout<T>(promise: Promise<T>): Promise<T> {
    let timeout: NodeJS.Timeout | null = null;

    try {
      return await Promise.race([
        promise,
        new Promise<T>((_, reject) => {
          timeout = setTimeout(() => {
            reject(new Error(`Synchronisation interrompue après timeout applicatif (${this.maxDurationMinutes()} min)`));
          }, this.maxDurationMs());
        })
      ]);
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
    }
  }

  private async failInterruptedRuns() {
    const result = await this.prisma.syncLog.updateMany({
      where: {
        status: SyncStatus.RUNNING,
        finishedAt: null
      },
      data: {
        status: SyncStatus.FAILED,
        finishedAt: new Date(),
        errorMessage: "Interrompu par un redémarrage serveur"
      }
    });

    if (result.count > 0) {
      this.logger.warn(`${result.count} synchronisation(s) RUNNING marquée(s) FAILED au démarrage.`);
    }
  }

  private async failTimedOutRuns() {
    const cutoff = new Date(Date.now() - this.maxDurationMs());
    const result = await this.prisma.syncLog.updateMany({
      where: {
        status: SyncStatus.RUNNING,
        finishedAt: null,
        startedAt: {
          lt: cutoff
        }
      },
      data: {
        status: SyncStatus.FAILED,
        finishedAt: new Date(),
        errorMessage: `Synchronisation interrompue après timeout applicatif (${this.maxDurationMinutes()} min)`
      }
    });

    if (result.count > 0) {
      this.logger.warn(`${result.count} synchronisation(s) RUNNING expirée(s) marquée(s) FAILED.`);
    }
  }

  private maxDurationMinutes() {
    const raw = Number(this.config.get("SYNC_MAX_DURATION_MINUTES") || 15);
    return Number.isFinite(raw) && raw > 0 ? raw : 15;
  }

  private maxDurationMs() {
    return this.maxDurationMinutes() * 60_000;
  }

  private async pullAll(cursor: SyncCursor, options: { full?: boolean } = {}): Promise<BioTimeSyncCounts> {
    const transactionsFrom = this.transactionSyncFrom(cursor.punchesSince);
    const transactionsTo = new Date(Date.now() + 60_000).toISOString();
    const transactionProgress: ProgressCallback = (page, totalRows) => {
      if (page === 1 || page % 10 === 0) {
        this.logger.log(`BioTime Transactions upload_time: page ${page}, ${totalRows} ligne(s) cumulée(s).`);
      }
    };
    const transactionsPromise = this.biotime.listTransactionsUploadedAfter(transactionsFrom, transactionProgress, transactionsTo)
      .catch(error => {
        const fallbackFrom = this.transactionPunchTimeFallbackFrom();
        this.logger.warn(
          `BioTime upload_time non exploitable (${error instanceof Error ? error.message : String(error)}). ` +
          `Fallback punch_time ${fallbackFrom} -> ${transactionsTo}.`
        );
        return this.biotime.listTransactions(fallbackFrom, undefined, transactionsTo);
      });
    const results = await Promise.allSettled([
      this.biotime.listEmployees(options.full ? undefined : cursor.employeesSince),
      this.biotime.listResigns(options.full ? undefined : cursor.resignsSince),
      this.biotime.listDevices(cursor.devicesSince),
      transactionsPromise
    ]);

    const [employeesResult, resignsResult, devicesResult, transactionsResult] = results;

    if (employeesResult.status === "rejected") {
      throw employeesResult.reason;
    }

    if (resignsResult.status === "rejected") {
      throw resignsResult.reason;
    }

    const employees = employeesResult.status === "fulfilled" ? employeesResult.value : [];
    const resigns = resignsResult.status === "fulfilled" ? resignsResult.value : [];
    const devices = devicesResult.status === "fulfilled" ? devicesResult.value : [];
    const transactions = transactionsResult.status === "fulfilled" ? transactionsResult.value : [];

    results.forEach(result => {
      if (result.status === "rejected") {
        this.logger.error(`Erreur durant la récupération de données BioTime: ${result.reason}`);
      }
    });

    let employeesCount = 0;
    let resignsCount = 0;
    let devicesCount = 0;
    let punchesCount = 0;
    let backfillPunchesCount = 0;
    let backfillRowsCount = 0;
    let employeePunchSweepCount = 0;
    let employeePunchSweepRowsCount = 0;
    let employeePunchSweepEmployeesCount = 0;
    let reactivatedCount = options.full ? await this.countEmployeesReactivatedByFullSync(employees, resigns) : 0;

    if (employeesResult.status === "fulfilled") {
      for (const row of employees) {
        if (await this.upsertEmployee(row, { markActive: Boolean(options.full) })) employeesCount += 1;
      }
    }

    if (devicesResult.status === "fulfilled") {
      for (const row of devices) {
        if (await this.upsertDevice(row)) devicesCount += 1;
      }
    }

    if (resignsResult.status === "fulfilled") {
      for (const row of resigns) {
        if (await this.upsertResign(row)) resignsCount += 1;
      }
    }

    if (transactionsResult.status === "fulfilled") {
      for (const row of transactions) {
        if (await this.upsertTransaction(row)) punchesCount += 1;
      }
      this.logger.log(`BioTime Transactions: ${transactions.length} ligne(s) reçue(s) depuis upload_time ${transactionsFrom}.`);
    }

    if (options.full || this.shouldRunRollingBackfillAfterSync()) {
      const backfill = await this.pullRollingPunchBackfill();
      backfillPunchesCount = backfill.punchesCount;
      backfillRowsCount = backfill.rowsCount;
      this.lastRollingBackfillAt = new Date();
    }

    if (options.full || this.shouldRunEmployeePunchSweepAfterSync()) {
      const sweep = await this.pullEmployeePunchSweep();
      employeePunchSweepCount = sweep.punchesCount;
      employeePunchSweepRowsCount = sweep.rowsCount;
      employeePunchSweepEmployeesCount = sweep.employeesCount;
      this.lastEmployeePunchSweepAt = new Date();
    }

    if (options.full) {
      reactivatedCount += await this.reconcileCurrentResigns(resigns);
    }

    return { employeesCount, resignsCount, devicesCount, punchesCount, reactivatedCount, backfillPunchesCount, backfillRowsCount, employeePunchSweepCount, employeePunchSweepRowsCount, employeePunchSweepEmployeesCount };
  }

  private transactionSyncFrom(cursorPunchesSince?: string) {
    const lookbackDays = Number(this.config.get("BIOTIME_TRANSACTIONS_LOOKBACK_DAYS") || 7);
    const fallback = new Date(Date.now() - Math.max(1, lookbackDays) * 24 * 60 * 60_000);

    if (!cursorPunchesSince) {
      return fallback.toISOString();
    }

    const cursorDate = new Date(cursorPunchesSince);
    if (Number.isNaN(cursorDate.getTime())) {
      return fallback.toISOString();
    }

    const overlapHours = Number(this.config.get("BIOTIME_UPLOAD_CURSOR_OVERLAP_HOURS") || 2);
    cursorDate.setHours(cursorDate.getHours() - Math.max(1, overlapHours));
    return new Date(Math.max(cursorDate.getTime(), fallback.getTime())).toISOString();
  }

  private rollingBackfillWindow() {
    const days = Number(this.config.get("BIOTIME_PUNCH_BACKFILL_DAYS") || 7);
    const safeDays = Number.isFinite(days) && days > 0 ? days : 7;
    const to = new Date(Date.now() + 60_000);
    const from = new Date(Date.now() - safeDays * 24 * 60 * 60_000);
    return { from: from.toISOString(), to: to.toISOString(), days: safeDays };
  }

  private transactionPunchTimeFallbackFrom() {
    const hours = Number(this.config.get("BIOTIME_PUNCH_FALLBACK_LOOKBACK_HOURS") || 12);
    const safeHours = Number.isFinite(hours) && hours > 0 ? hours : 12;
    return new Date(Date.now() - safeHours * 60 * 60_000).toISOString();
  }

  private async pullRollingPunchBackfill() {
    const window = this.rollingBackfillWindow();
    const transactions = await this.biotime.listTransactions(window.from, undefined, window.to);
    let punchesCount = 0;

    for (const row of transactions) {
      if (await this.upsertTransaction(row)) punchesCount += 1;
    }

    this.logger.log(
      `BioTime Backfill glissant: ${transactions.length} ligne(s) trouvée(s), ${punchesCount} pointage(s) upserté(s), fenêtre ${window.days} jour(s) ${window.from} -> ${window.to}.`
    );

    return { rowsCount: transactions.length, punchesCount };
  }

  private shouldRunRollingBackfillAfterSync() {
    if (String(this.config.get("BIOTIME_PUNCH_BACKFILL_AFTER_SYNC") || "true").toLowerCase() === "false") {
      return false;
    }

    const intervalMinutes = Number(this.config.get("BIOTIME_PUNCH_BACKFILL_MIN_INTERVAL_MINUTES") || 60);
    const safeIntervalMinutes = Number.isFinite(intervalMinutes) && intervalMinutes > 0 ? intervalMinutes : 60;
    if (!this.lastRollingBackfillAt) {
      return true;
    }

    return Date.now() - this.lastRollingBackfillAt.getTime() >= safeIntervalMinutes * 60_000;
  }

  private employeePunchSweepWindow() {
    const days = Number(this.config.get("BIOTIME_EMPLOYEE_PUNCH_SWEEP_DAYS") || this.config.get("BIOTIME_PUNCH_BACKFILL_DAYS") || 7);
    const safeDays = Number.isFinite(days) && days > 0 ? days : 7;
    const to = new Date(Date.now() + 60_000);
    const from = new Date(Date.now() - safeDays * 24 * 60 * 60_000);
    return { from: from.toISOString(), to: to.toISOString(), days: safeDays };
  }

  private shouldRunEmployeePunchSweepAfterSync() {
    if (String(this.config.get("BIOTIME_EMPLOYEE_PUNCH_SWEEP_AFTER_SYNC") || "true").toLowerCase() === "false") {
      return false;
    }

    const intervalMinutes = Number(this.config.get("BIOTIME_EMPLOYEE_PUNCH_SWEEP_MIN_INTERVAL_MINUTES") || 5);
    const safeIntervalMinutes = Number.isFinite(intervalMinutes) && intervalMinutes > 0 ? intervalMinutes : 5;
    if (!this.lastEmployeePunchSweepAt) {
      return true;
    }

    return Date.now() - this.lastEmployeePunchSweepAt.getTime() >= safeIntervalMinutes * 60_000;
  }

  private async pullEmployeePunchSweep(from?: string, to?: string) {
    const window = from && to ? { from, to, days: 0 } : this.employeePunchSweepWindow();
    const employees = await this.prisma.employee.findMany({
      where: { status: EmployeeStatus.ACTIVE },
      select: { id: true, employeeCode: true, zktecoId: true, fullName: true },
      orderBy: { fullName: "asc" },
      take: Number(this.config.get("BIOTIME_EMPLOYEE_PUNCH_SWEEP_MAX_EMPLOYEES") || 2000)
    });
    let rowsCount = 0;
    let punchesCount = 0;
    let employeesWithRows = 0;

    for (let index = 0; index < employees.length; index += 1) {
      const employee = employees[index];
      const candidates = [...new Set([employee.employeeCode, employee.zktecoId].filter(Boolean))] as string[];
      let rows: BioTimeRecord[] = [];

      for (const empCode of candidates) {
        rows = await this.biotime.listTransactionsForEmployee(empCode, window.from, undefined, window.to);
        if (rows.length || empCode === candidates[candidates.length - 1]) break;
      }

      if (rows.length) employeesWithRows += 1;
      rowsCount += rows.length;
      for (const row of rows) {
        if (await this.upsertTransaction(row)) punchesCount += 1;
      }

      if ((index + 1) % 50 === 0 || index + 1 === employees.length) {
        this.logger.log(`BioTime Employee punch sweep: ${index + 1}/${employees.length} employé(s), ${rowsCount} ligne(s), ${punchesCount} pointage(s) traités.`);
      }
    }

    this.logger.log(
      `BioTime Employee punch sweep terminé: ${employees.length} employé(s) vérifié(s), ${employeesWithRows} avec pointages, ${rowsCount} ligne(s), ${punchesCount} pointage(s), fenêtre ${window.from} -> ${window.to}.`
    );

    return { employeesCount: employees.length, employeesWithRows, rowsCount, punchesCount };
  }

  /**
   * Rapatriement explicite et isolé des pointages BioTime sur une plage de dates.
   * Opération distincte de la synchronisation normale, à utiliser uniquement pour
   * un backfill historique ponctuel. Ne modifie pas le curseur de synchro normal.
   */
  async backfillPunches(from?: string, to?: string, actorId?: string, trigger = "backfill") {
    const window = from && to
      ? { from, to }
      : trigger === "scheduled_punch_backfill"
        ? this.rollingBackfillWindow()
        : { from: "2026-07-25T00:00:00", to: "2026-08-03T23:59:59" };
    const fromDate = new Date(window.from);
    const toDate = new Date(window.to);

    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
      throw new BadRequestException("Les paramètres 'from' et 'to' doivent être des dates ISO valides.");
    }

    if (fromDate >= toDate) {
      throw new BadRequestException("'from' doit être antérieur à 'to'.");
    }

    await this.failTimedOutRuns();

    if (this.running) {
      throw new BadRequestException("Une synchronisation est déjà en cours. Réessayez après son achèvement.");
    }

    this.running = true;
    this.runningStartedAt = new Date();
    this.runningTrigger = trigger;
    const sequence = ++this.runSequence;
    const log = await this.prisma.syncLog.create({
      data: {
        trigger,
        metadata: { from: window.from, to: window.to }
      }
    });

    try {
      const logProgress: ProgressCallback = (page, totalRows) => {
        this.logger.log(`BioTime Backfill: page ${page} récupérée, ${totalRows} lignes cumulées`);
      };

      this.logger.log(`Backfill des pointages BioTime du ${window.from} au ${window.to}...`);
      const transactions = await this.biotime.listTransactions(window.from, logProgress, window.to);

      let punchesCount = 0;
      for (const row of transactions) {
        if (await this.upsertTransaction(row)) punchesCount += 1;
      }

      this.logger.log(`Backfill terminé: ${transactions.length} ligne(s) trouvée(s), ${punchesCount} pointage(s) upserté(s) du ${window.from} au ${window.to}.`);

      const updated = await this.prisma.syncLog.update({
        where: { id: log.id },
        data: {
          status: SyncStatus.SUCCESS,
          finishedAt: new Date(),
          punchesCount,
          metadata: { from: window.from, to: window.to, rowsCount: transactions.length }
        }
      });

      await this.audit.record({
        userId: actorId,
        action: "sync.backfill",
        entityType: "sync_log",
        entityId: updated.id,
        after: updated
      });

      return updated;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Backfill échoué: ${message}`);

      if (error instanceof BadRequestException) {
        throw error;
      }

      const failed = await this.prisma.syncLog.update({
        where: { id: log.id },
        data: {
          status: SyncStatus.FAILED,
          finishedAt: new Date(),
          errorMessage: message
        }
      });
      await this.notifications.notify(await this.notifications.adminItUserIds(), NotificationType.SYNC_ERROR, {
        title: "Backfill BioTime échoué",
        message,
        entityType: "sync_log",
        entityId: failed.id
      });
      return failed;
    } finally {
      if (this.runSequence === sequence) {
        this.running = false;
        this.runningStartedAt = null;
        this.runningTrigger = null;
      }
    }
  }

  async employeePunchSweep(from?: string, to?: string, actorId?: string, trigger = "employee_punch_sweep") {
    const window = from && to ? { from, to } : this.employeePunchSweepWindow();
    const fromDate = new Date(window.from);
    const toDate = new Date(window.to);

    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
      throw new BadRequestException("Les paramètres 'from' et 'to' doivent être des dates ISO valides.");
    }

    if (fromDate >= toDate) {
      throw new BadRequestException("'from' doit être antérieur à 'to'.");
    }

    await this.failTimedOutRuns();

    if (this.running) {
      throw new BadRequestException("Une synchronisation est déjà en cours. Réessayez après son achèvement.");
    }

    this.running = true;
    this.runningStartedAt = new Date();
    this.runningTrigger = trigger;
    const sequence = ++this.runSequence;
    const log = await this.prisma.syncLog.create({
      data: {
        trigger,
        metadata: { from: window.from, to: window.to, kind: "employee_punch_sweep" }
      }
    });

    try {
      const sweep = await this.pullEmployeePunchSweep(window.from, window.to);
      const updated = await this.prisma.syncLog.update({
        where: { id: log.id },
        data: {
          status: SyncStatus.SUCCESS,
          finishedAt: new Date(),
          punchesCount: sweep.punchesCount,
          metadata: {
            from: window.from,
            to: window.to,
            kind: "employee_punch_sweep",
            rowsCount: sweep.rowsCount,
            employeesCount: sweep.employeesCount,
            employeesWithRows: sweep.employeesWithRows
          }
        }
      });

      await this.audit.record({
        userId: actorId,
        action: "sync.employee_punch_sweep",
        entityType: "sync_log",
        entityId: updated.id,
        after: updated
      });

      return updated;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Employee punch sweep échoué: ${message}`);
      const failed = await this.prisma.syncLog.update({
        where: { id: log.id },
        data: {
          status: SyncStatus.FAILED,
          finishedAt: new Date(),
          errorMessage: message
        }
      });
      await this.notifications.notify(await this.notifications.adminItUserIds(), NotificationType.SYNC_ERROR, {
        title: "Employee punch sweep BioTime échoué",
        message,
        entityType: "sync_log",
        entityId: failed.id
      });
      return failed;
    } finally {
      if (this.runSequence === sequence) {
        this.running = false;
        this.runningStartedAt = null;
        this.runningTrigger = null;
      }
    }
  }

  private async upsertEmployee(row: BioTimeRecord, options: { markActive?: boolean } = {}) {
    const zktecoId = employeeSourceId(row);
    if (!zktecoId) return false;
    const code = employeeCode(row);
    const statusPatch = options.markActive
      ? {
          status: EmployeeStatus.ACTIVE,
          resignedAt: null
        }
      : {};

    await this.prisma.employee.upsert({
      where: { zktecoId },
      update: {
        biotimeCode: stringField(row, ["biotime_code", "code"]),
        employeeCode: code,
        fullName: employeeName(row),
        department: departmentName(row) || null,
        phone: stringField(row, ["mobile", "phone", "telephone"]) || null,
        hireDate: dateField(row, ["hire_date", "employment_date"]),
        sourceUpdatedAt: dateField(row, ["update_time", "updated_time", "last_update"]),
        sourcePayload: jsonPayload(row),
        ...statusPatch
      },
      create: {
        zktecoId,
        biotimeCode: stringField(row, ["biotime_code", "code"]) || null,
        employeeCode: code,
        fullName: employeeName(row),
        department: departmentName(row) || null,
        phone: stringField(row, ["mobile", "phone", "telephone"]) || null,
        hireDate: dateField(row, ["hire_date", "employment_date"]),
        status: EmployeeStatus.ACTIVE,
        sourceUpdatedAt: dateField(row, ["update_time", "updated_time", "last_update"]),
        sourcePayload: jsonPayload(row)
      }
    });

    return true;
  }

  private async upsertDevice(row: BioTimeRecord) {
    const zktecoId = stringField(row, ["id", "terminal_id", "sn", "serial_number"]);
    if (!zktecoId) return false;

    await this.prisma.device.upsert({
      where: { zktecoId },
      update: {
        biotimeId: stringField(row, ["id", "terminal_id"]) || null,
        serialNumber: stringField(row, ["sn", "serial_number"]) || null,
        name: stringField(row, ["alias", "terminal_name", "name"], zktecoId),
        ipAddress: ipAddress(row),
        area: stringField(row, ["area_name", "area"]) || null,
        status: deviceStatus(row),
        lastSeenAt: dateField(row, ["last_activity", "last_seen", "update_time"]),
        sourceUpdatedAt: dateField(row, ["update_time", "updated_time", "last_activity"]),
        sourcePayload: jsonPayload(row)
      },
      create: {
        zktecoId,
        biotimeId: stringField(row, ["id", "terminal_id"]) || null,
        serialNumber: stringField(row, ["sn", "serial_number"]) || null,
        name: stringField(row, ["alias", "terminal_name", "name"], zktecoId),
        ipAddress: ipAddress(row),
        area: stringField(row, ["area_name", "area"]) || null,
        status: deviceStatus(row),
        lastSeenAt: dateField(row, ["last_activity", "last_seen", "update_time"]),
        sourceUpdatedAt: dateField(row, ["update_time", "updated_time", "last_activity"]),
        sourcePayload: jsonPayload(row)
      }
    });

    return true;
  }

  private async upsertResign(row: BioTimeRecord) {
    const biotimeId = stringField(row, ["id", "resign_id"]);
    if (!biotimeId) return false;
    const employeeZktecoId = resignEmployeeSourceId(row);
    // Rapprochement strict par identifiant source BioTime/ZKTeco, jamais par matricule affiché local.
    const employee = employeeZktecoId ? await this.prisma.employee.findUnique({ where: { zktecoId: employeeZktecoId } }) : null;
    const resignDate = dateField(row, ["resign_date", "date", "leaving_date"]);

    await this.prisma.$transaction(async tx => {
      await tx.resignRecord.upsert({
        where: { biotimeId },
        update: {
          employeeId: employee?.id || null,
          employeeZktecoId: employeeZktecoId || null,
          resignDate,
          reason: stringField(row, ["reason", "resign_reason"]) || null,
          sourceUpdatedAt: dateField(row, ["update_time", "updated_time", "resign_date"]),
          sourcePayload: jsonPayload(row)
        },
        create: {
          biotimeId,
          employeeId: employee?.id || null,
          employeeZktecoId: employeeZktecoId || null,
          resignDate,
          reason: stringField(row, ["reason", "resign_reason"]) || null,
          sourceUpdatedAt: dateField(row, ["update_time", "updated_time", "resign_date"]),
          sourcePayload: jsonPayload(row)
        }
      });

      if (employee) {
        await tx.employee.update({
          where: { id: employee.id },
          data: {
            status: EmployeeStatus.RESIGNED,
            resignedAt: resignDate
          }
        });
      }
    });

    return true;
  }

  private async reconcileCurrentResigns(resigns: BioTimeRecord[]) {
    const currentResignedIds = new Set(
      resigns
        .map(row => resignEmployeeSourceId(row))
        .filter(Boolean)
    );

    const staleResignedEmployees = await this.prisma.employee.findMany({
      where: {
        status: EmployeeStatus.RESIGNED,
        NOT: {
          zktecoId: {
            in: Array.from(currentResignedIds)
          }
        }
      },
      select: { id: true }
    });

    if (!staleResignedEmployees.length) {
      return 0;
    }

    await this.prisma.employee.updateMany({
      where: {
        id: {
          in: staleResignedEmployees.map(employee => employee.id)
        }
      },
      data: {
        status: EmployeeStatus.ACTIVE,
        resignedAt: null
      }
    });

    return staleResignedEmployees.length;
  }

  private async countEmployeesReactivatedByFullSync(employees: BioTimeRecord[], resigns: BioTimeRecord[]) {
    const currentResignedIds = new Set(
      resigns
        .map(row => resignEmployeeSourceId(row))
        .filter(Boolean)
    );
    const activeSourceIds = employees
      .map(row => employeeSourceId(row))
      .filter(id => id && !currentResignedIds.has(id));

    if (!activeSourceIds.length) {
      return 0;
    }

    return this.prisma.employee.count({
      where: {
        status: EmployeeStatus.RESIGNED,
        zktecoId: {
          in: activeSourceIds
        }
      }
    });
  }

  private async upsertTransaction(row: BioTimeRecord) {
    const biotimeId = stringField(row, ["id", "transaction_id"]);
    const punchId = biotimeId || stringField(row, ["uuid"]);
    if (!punchId) return false;
    const employeeZktecoId = stringField(row, ["emp", "emp_id", "employee", "employee_id", "emp_code"]);
    // Le matricule local est volontairement exclu du matching pour préserver l'intégrité des pointages.
    const employee = employeeZktecoId ? await this.prisma.employee.findFirst({ where: { OR: [{ zktecoId: employeeZktecoId }, { employeeCode: employeeZktecoId }] } }) : null;
    const punchTime = dateField(row, ["punch_time", "timestamp", "time"]);
    const sourceUploadedAt = dateField(row, ["upload_time", "uploadTime", "uploaded_at", "created_at", "create_time"]);

    if (!employee || !punchTime) return false;

    await this.attendancePunches.recordMatchedPunch({
      employeeId: employee.id,
      punchTime,
      sourceUploadedAt,
      direction: punchDirection(row),
      zktecoPunchId: punchId,
      biotimeId: biotimeId || null,
      shiftStatus: PunchShiftStatus.UNMATCHED,
      rawPayload: row
    });

    return true;
  }

  private async lastCursor(): Promise<SyncCursor> {
    const last = await this.prisma.syncLog.findFirst({
      where: { status: SyncStatus.SUCCESS },
      orderBy: { startedAt: "desc" }
    });

    return (last?.lastCursor as SyncCursor | null) || {};
  }

  private async computeCursor(): Promise<SyncCursor> {
    const [employee, resign, device, punch] = await Promise.all([
      this.prisma.employee.findFirst({ where: { sourceUpdatedAt: { not: null } }, orderBy: { sourceUpdatedAt: "desc" } }),
      this.prisma.resignRecord.findFirst({ where: { sourceUpdatedAt: { not: null } }, orderBy: { sourceUpdatedAt: "desc" } }),
      this.prisma.device.findFirst({ where: { sourceUpdatedAt: { not: null } }, orderBy: { sourceUpdatedAt: "desc" } }),
      this.prisma.attendancePunch.findFirst({
        where: { sourceUploadedAt: { not: null } },
        orderBy: { sourceUploadedAt: "desc" }
      })
    ]);

    return {
      employeesSince: employee?.sourceUpdatedAt?.toISOString(),
      resignsSince: resign?.sourceUpdatedAt?.toISOString(),
      devicesSince: device?.sourceUpdatedAt?.toISOString(),
      punchesSince: punch?.sourceUploadedAt?.toISOString()
    };
  }
}
