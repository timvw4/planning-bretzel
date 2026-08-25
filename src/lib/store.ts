// ============================================================
// STORE ZUSTAND — Gestion d'état globale de l'application
// Les données sont synchronisées avec Supabase.
// Pattern : mise à jour optimiste locale + sync Supabase en arrière-plan
// ============================================================

import { create } from 'zustand';
import toast from 'react-hot-toast';
import { Employee, Shift, ScheduleEntry, AppSettings, PlanningAlert } from './types';
import { defaultSettings } from '@/data/mock';
import {
  buildPlanningAlerts,
  applyResolvedPlanningAlerts,
  filterAlertsByNotifications,
  getAlertWindow,
  getAvailabilityFetchRange,
  getPlannedEntryDurationHours,
  getValidatedEntryDurationHours,
  mergeAvailabilityWindowIntoMap,
  availabilityMapKey,
} from './utils';
import { db } from '@/lib/supabase/db';
import { createClient } from '@/lib/supabase/client';
import { supabaseErrorMessage } from '@/lib/supabase/errorMessage';
import { format } from 'date-fns';
import { fetchGeofencePunchAlerts, fetchMissingPunchAlerts } from '@/lib/timePunches';

function mergeAlertsPreservingResolved(
  prev: PlanningAlert[],
  next: PlanningAlert[],
  resolvedIds: string[]
): PlanningAlert[] {
  const resolvedSet = new Set([
    ...resolvedIds,
    ...prev.filter((a) => a.resolved).map((a) => a.id),
  ]);
  return next.map((a) =>
    resolvedSet.has(a.id) ? { ...a, resolved: true } : a
  );
}

/**
 * Alertes qui demandent une lecture des pointages : hors périmètre GPS et
 * journées planifiées sans pointage. Une erreur réseau sur ces deux
 * requêtes ne doit pas faire disparaître les autres alertes.
 */
async function appendPunchAlerts(
  base: PlanningAlert[],
  employees: Employee[],
  shifts: Shift[],
  scheduleEntries: ScheduleEntry[],
  settings: AppSettings,
  prevAlerts: PlanningAlert[],
  resolvedIds: string[]
): Promise<PlanningAlert[]> {
  const supabase = createClient();
  const extra: PlanningAlert[] = [];

  if (settings.notifications?.geofencePunch !== false) {
    try {
      extra.push(...(await fetchGeofencePunchAlerts(supabase, employees)));
    } catch (err) {
      console.error('Alertes GPS :', err);
    }
  }

  if (settings.notifications?.missingPunch !== false) {
    try {
      const workShiftIds = new Set(
        shifts.filter((s) => s.type === 'work').map((s) => s.id)
      );
      const plannedWorkDays = scheduleEntries
        .filter((e) => workShiftIds.has(e.shiftId))
        .map((e) => ({
          employeeId: e.employeeId,
          date: e.date,
          validated: Boolean(e.validatedStart && e.validatedEnd),
        }));
      extra.push(
        ...(await fetchMissingPunchAlerts(supabase, employees, plannedWorkDays))
      );
    } catch (err) {
      console.error('Alertes journées non pointées :', err);
    }
  }

  return mergeAlertsPreservingResolved(prevAlerts, [...base, ...extra], resolvedIds);
}

interface PlanningStore {
  // ---- Données ----
  employees: Employee[];
  shifts: Shift[];
  scheduleEntries: ScheduleEntry[];
  settings: AppSettings;
  alerts: PlanningAlert[];
  /** IDs d'alertes marquées résolues (sync Supabase). */
  resolvedAlertIds: string[];
  isLoading: boolean;
  /** Statut dispo employé par cellule : clé → `vacation` | `unavailable` (exceptions uniquement) */
  availabilityStatusByKey: Record<string, string>;

  /** Filtre employés partagé (planning prévu / réel, mensuel / hebdo). */
  planningEmployeeFilterMode: 'all' | 'subset';
  planningSelectedEmployeeIds: string[];
  setPlanningEmployeeFilterMode: (mode: 'all' | 'subset') => void;
  setPlanningSelectedEmployeeIds: (ids: string[]) => void;

  // ---- Vue planning ----
  currentDate: string;

  // ---- Chargement depuis Supabase ----
  loadData: (options?: { silent?: boolean }) => Promise<void>;
  /** Charge / fusionne les disponibilités pour une plage de dates (vues planning). */
  mergeAvailabilityRequests: (dateFrom: string, dateTo: string) => Promise<void>;

  // ---- Actions Employés ----
  addEmployee: (employee: Omit<Employee, 'id' | 'createdAt'>) => Promise<void>;
  updateEmployee: (id: string, updates: Partial<Employee>) => Promise<void>;
  deleteEmployee: (id: string) => void;
  toggleMonthlyActive: (employeeId: string, monthKey: string) => void;

  // ---- Actions Shifts ----
  addShift: (shift: Omit<Shift, 'id'>) => void;
  updateShift: (id: string, updates: Partial<Shift>) => void;
  deleteShift: (id: string) => void;

  // ---- Actions Planning ----
  assignShift: (employeeId: string, date: string, shiftId: string, note?: string) => void;
  removeShift: (employeeId: string, date: string) => void;
  /** Met à jour les heures réelles validées (planning réel + sync pointage approuvé). */
  updateValidatedTimes: (
    employeeId: string,
    date: string,
    validatedStart: string,
    validatedEnd: string,
    options?: {
      pauseMinutes?: number;
      hadSnack?: boolean;
      ateWorkFood?: boolean;
    }
  ) => Promise<void>;
  /** Retire une journée du planning réel et archive le pointage associé. */
  removeValidatedDay: (employeeId: string, date: string) => Promise<void>;
  copyWeek: (sourceWeekStart: string, targetWeekStart: string) => void;
  setCurrentDate: (date: string) => void;

  // ---- Settings ----
  updateSettings: (updates: Partial<AppSettings>) => Promise<void>;

  /** Publie le planning du mois : les employés voient les créneaux de cette plage. */
  publishMonthForEmployees: (monthKey: string) => Promise<void>;
  /** Publie la semaine (lundi → dimanche) : les employés voient ces jours. */
  publishWeekForEmployees: (weekStartMonday: string, weekEndSunday: string) => Promise<void>;

  // ---- Alertes ----
  refreshAlerts: () => Promise<void>;
  resolveAlert: (alertId: string) => void;
  resolveAlerts: (alertIds: string[]) => void;

  // ---- Getters calculés ----
  getEntryForCell: (employeeId: string, date: string) => ScheduleEntry | undefined;
  getShiftById: (shiftId: string) => Shift | undefined;
  getEmployeeById: (employeeId: string) => Employee | undefined;
  getActiveEmployees: () => Employee[];
  getActiveShifts: () => Shift[];
  getWeeklyHours: (employeeId: string, weekStart: string, weekEnd: string) => number;
  getMonthlyHours: (employeeId: string, monthStart: string, monthEnd: string) => number;
  getValidatedWeeklyHours: (employeeId: string, weekStart: string, weekEnd: string) => number;
  getValidatedMonthlyHours: (employeeId: string, monthStart: string, monthEnd: string) => number;
  getAvailabilityStatus: (employeeId: string, date: string) => string | undefined;
}

export const usePlanningStore = create<PlanningStore>((set, get) => ({
  // ---- État initial ----
  employees: [],
  shifts: [],
  scheduleEntries: [],
  settings: defaultSettings,
  alerts: [],
  resolvedAlertIds: [],
  isLoading: true,
  currentDate: format(new Date(), 'yyyy-MM-dd'),
  availabilityStatusByKey: {},
  planningEmployeeFilterMode: 'all',
  planningSelectedEmployeeIds: [],

  setPlanningEmployeeFilterMode: (mode) => set({ planningEmployeeFilterMode: mode }),
  setPlanningSelectedEmployeeIds: (ids) => set({ planningSelectedEmployeeIds: ids }),

  // ---- Chargement depuis Supabase ─────────────────────────
  loadData: async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    if (!silent) set({ isLoading: true });
    try {
      const [employees, shifts, entries, settings, resolvedAlertIds] = await Promise.all([
        db.getEmployees(),
        db.getShifts(),
        db.getScheduleEntries(),
        db.getSettings(),
        db.getResolvedPlanningAlertIds().catch((err) => {
          console.error('Alertes résolues (lecture) :', err);
          return [] as string[];
        }),
      ]);

      const today = new Date();
      const appSettings = settings ?? defaultSettings;
      const alertWindow = getAlertWindow(today);
      const { rangeFrom, rangeTo } = getAvailabilityFetchRange(entries, today);

      let alerts: PlanningAlert[] = [];
      let availabilityStatusByKey = get().availabilityStatusByKey;
      try {
        const [requests, validations] = await Promise.all([
          db.getAvailabilityRequestsInRange(rangeFrom, rangeTo),
          db.getAvailabilityValidations(),
        ]);
        alerts = buildPlanningAlerts(
          employees,
          shifts,
          entries,
          alertWindow,
          appSettings,
          requests,
          validations
        );
        availabilityStatusByKey = mergeAvailabilityWindowIntoMap(
          get().availabilityStatusByKey,
          rangeFrom,
          rangeTo,
          requests
        );
      } catch (err) {
        console.error('loadData : disponibilités / validations (alertes partielles)', err);
        alerts = buildPlanningAlerts(
          employees,
          shifts,
          entries,
          alertWindow,
          appSettings,
          [],
          []
        );
      }

      alerts = applyResolvedPlanningAlerts(alerts, resolvedAlertIds);
      alerts = await appendPunchAlerts(
        alerts,
        employees,
        shifts,
        entries,
        appSettings,
        get().alerts,
        resolvedAlertIds
      );
      alerts = filterAlertsByNotifications(alerts, appSettings.notifications);

      set({
        employees,
        shifts,
        scheduleEntries: entries,
        settings: settings ?? defaultSettings,
        alerts,
        resolvedAlertIds,
        availabilityStatusByKey,
        ...(silent ? {} : { isLoading: false }),
      });
    } catch (error) {
      console.error('Erreur lors du chargement des données:', error);
      if (!silent) set({ isLoading: false });
    }
  },

  mergeAvailabilityRequests: async (dateFrom, dateTo) => {
    try {
      const rows = await db.getAvailabilityRequestsInRange(dateFrom, dateTo);
      set((state) => ({
        availabilityStatusByKey: mergeAvailabilityWindowIntoMap(
          state.availabilityStatusByKey,
          dateFrom,
          dateTo,
          rows
        ),
      }));
    } catch (err) {
      console.error('mergeAvailabilityRequests : lecture disponibilités (fenêtre planning)', err);
    }
  },

  // ---- Employés ───────────────────────────────────────────
  addEmployee: async (employeeData) => {
    const newEmployee: Employee = {
      ...employeeData,
      annualVacationDays: employeeData.annualVacationDays ?? 25,
      id: crypto.randomUUID(),
      createdAt: format(new Date(), 'yyyy-MM-dd'),
    };
    set((state) => ({ employees: [...state.employees, newEmployee] }));
    try {
      await db.upsertEmployee(newEmployee);
    } catch (err) {
      set((state) => ({
        employees: state.employees.filter((e) => e.id !== newEmployee.id),
      }));
      throw err;
    }
  },

  updateEmployee: async (id, updates) => {
    const previous = get().employees.find((e) => e.id === id);
    if (!previous) return;

    const employee: Employee = {
      ...previous,
      ...updates,
      annualVacationDays: updates.annualVacationDays ?? previous.annualVacationDays ?? 25,
    };

    set((state) => ({
      employees: state.employees.map((e) => (e.id === id ? employee : e)),
    }));

    try {
      await db.upsertEmployee(employee);
    } catch (err) {
      set((state) => ({
        employees: state.employees.map((e) => (e.id === id ? previous : e)),
      }));
      throw err;
    }
  },

  deleteEmployee: (id) => {
    set((state) => ({
      employees: state.employees.filter((e) => e.id !== id),
      scheduleEntries: state.scheduleEntries.filter((e) => e.employeeId !== id),
    }));
    db.deleteEmployee(id).catch(console.error);
    db.deleteEntriesForEmployee(id).catch(console.error);
  },

  toggleMonthlyActive: (employeeId, monthKey) => {
    set((state) => {
      const updated = state.employees.map((e) => {
        if (e.id !== employeeId) return e;
        const months = e.inactiveMonths ?? [];
        const isCurrentlyInactive = months.includes(monthKey);
        const newEmployee = {
          ...e,
          inactiveMonths: isCurrentlyInactive
            ? months.filter((m) => m !== monthKey)
            : [...months, monthKey],
        };
        db.upsertEmployee(newEmployee).catch(console.error);
        return newEmployee;
      });
      return { employees: updated };
    });
  },

  // ---- Shifts ─────────────────────────────────────────────
  addShift: (shiftData) => {
    const newShift: Shift = {
      ...shiftData,
      id: crypto.randomUUID(),
    };
    set((state) => ({ shifts: [...state.shifts, newShift] }));
    db.upsertShift(newShift).catch(console.error);
  },

  updateShift: (id, updates) => {
    set((state) => {
      const updated = state.shifts.map((s) =>
        s.id === id ? { ...s, ...updates } : s
      );
      const shift = updated.find((s) => s.id === id);
      if (shift) db.upsertShift(shift).catch(console.error);
      return { shifts: updated };
    });
  },

  deleteShift: (id) => {
    set((state) => ({
      shifts: state.shifts.filter((s) => s.id !== id),
    }));
    db.deleteShift(id).catch(console.error);
  },

  // ---- Planning ───────────────────────────────────────────
  assignShift: (employeeId, date, shiftId, note) => {
    const existingEntry = get().scheduleEntries.find(
      (e) => e.employeeId === employeeId && e.date === date
    );

    if (existingEntry) {
      const shiftChanged = existingEntry.shiftId !== shiftId;
      const updated: ScheduleEntry = {
        ...existingEntry,
        shiftId,
        note,
        isModified: true,
        visibleToEmployee: existingEntry.visibleToEmployee,
        // Nouveau type de shift : les heures validées ne correspondent plus au modèle
        validatedStart: shiftChanged ? null : existingEntry.validatedStart,
        validatedEnd: shiftChanged ? null : existingEntry.validatedEnd,
      };
      set((state) => ({
        scheduleEntries: state.scheduleEntries.map((e) =>
          e.employeeId === employeeId && e.date === date ? updated : e
        ),
      }));
      db.upsertEntry(updated).catch(console.error);
    } else {
      const newEntry: ScheduleEntry = {
        id: crypto.randomUUID(),
        employeeId,
        shiftId,
        date,
        note,
        isModified: false,
        visibleToEmployee: false,
      };
      set((state) => ({
        scheduleEntries: [...state.scheduleEntries, newEntry],
      }));
      db.upsertEntry(newEntry).catch(console.error);
    }

    void get().refreshAlerts();
  },

  removeShift: (employeeId, date) => {
    set((state) => ({
      scheduleEntries: state.scheduleEntries.filter(
        (e) => !(e.employeeId === employeeId && e.date === date)
      ),
    }));
    db.removeEntry(employeeId, date).catch(console.error);
    void get().refreshAlerts();
  },

  updateValidatedTimes: async (employeeId, date, validatedStart, validatedEnd, options) => {
    const entry = get().scheduleEntries.find(
      (e) => e.employeeId === employeeId && e.date === date
    );
    if (!entry) {
      toast.error('Aucune entrée planning pour ce jour.');
      return;
    }
    const updated: ScheduleEntry = {
      ...entry,
      validatedStart,
      validatedEnd,
      validatedBreakMinutes:
        options?.pauseMinutes !== undefined
          ? options.pauseMinutes
          : entry.validatedBreakMinutes ?? null,
      isModified: true,
    };
    set((state) => ({
      scheduleEntries: state.scheduleEntries.map((e) =>
        e.employeeId === employeeId && e.date === date ? updated : e
      ),
    }));
    try {
      await db.upsertEntry(updated);
      const supabase = createClient();
      const punchUpdate: Record<string, unknown> = {
        actual_start: validatedStart,
        actual_end: validatedEnd,
        reviewed_at: new Date().toISOString(),
      };
      if (options) {
        if (options.pauseMinutes !== undefined) {
          punchUpdate.pause_minutes = options.pauseMinutes;
          // L'ancienne case reste alignée pour les écrans qui l'affichent encore.
          punchUpdate.pause_15min = options.pauseMinutes >= 15;
        }
        if (options.hadSnack !== undefined) punchUpdate.had_snack = options.hadSnack;
        if (options.ateWorkFood !== undefined) punchUpdate.ate_work_food = options.ateWorkFood;
      }
      await supabase
        .from('time_declarations')
        .update(punchUpdate)
        .eq('employee_id', employeeId)
        .eq('date', date)
        .eq('status', 'approved')
        .is('deleted_at', null);
      toast.success('Heures réelles mises à jour');
    } catch (err) {
      console.error(err);
      toast.error('Erreur lors de la mise à jour des heures réelles');
      void get().loadData({ silent: true });
    }
  },

  removeValidatedDay: async (employeeId, date) => {
    const entry = get().scheduleEntries.find(
      (e) => e.employeeId === employeeId && e.date === date
    );
    if (!entry) {
      toast.error('Aucune entrée planning pour ce jour.');
      return;
    }
    const updated: ScheduleEntry = {
      ...entry,
      validatedStart: null,
      validatedEnd: null,
      validatedBreakMinutes: null,
      isModified: false,
    };
    set((state) => ({
      scheduleEntries: state.scheduleEntries.map((e) =>
        e.employeeId === employeeId && e.date === date ? updated : e
      ),
    }));
    try {
      await db.upsertEntry(updated);
      const supabase = createClient();
      // Archivage : le pointage disparaît des écrans mais reste en base,
      // parce qu'un pointage est une pièce justificative.
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await supabase
        .from('time_declarations')
        .update({
          deleted_at: new Date().toISOString(),
          deleted_by: userData.user?.id ?? null,
        })
        .eq('employee_id', employeeId)
        .eq('date', date)
        .is('deleted_at', null);
      if (error) throw error;
      toast.success('Journée retirée du planning réel — pointage archivé');
    } catch (err) {
      console.error(err);
      toast.error('Impossible de retirer cette journée');
      void get().loadData({ silent: true });
    }
  },

  copyWeek: (sourceWeekStart, targetWeekStart) => {
    const { scheduleEntries } = get();
    const sourceEnd = format(
      new Date(new Date(sourceWeekStart).getTime() + 6 * 86400000),
      'yyyy-MM-dd'
    );
    const targetEnd = format(
      new Date(new Date(targetWeekStart).getTime() + 6 * 86400000),
      'yyyy-MM-dd'
    );

    const sourceEntries = scheduleEntries.filter(
      (e) => e.date >= sourceWeekStart && e.date <= sourceEnd
    );

    const newEntries: ScheduleEntry[] = sourceEntries.map((entry) => {
      const dayOffset =
        (new Date(entry.date).getTime() - new Date(sourceWeekStart).getTime()) / 86400000;
      const newDate = format(
        new Date(new Date(targetWeekStart).getTime() + dayOffset * 86400000),
        'yyyy-MM-dd'
      );
      return {
        ...entry,
        id: crypto.randomUUID(),
        date: newDate,
        isModified: false,
        visibleToEmployee: false,
        validatedStart: null,
        validatedEnd: null,
      };
    });

    set((state) => ({
      scheduleEntries: [
        ...state.scheduleEntries.filter(
          (e) => !(e.date >= targetWeekStart && e.date <= targetEnd)
        ),
        ...newEntries,
      ],
    }));

    db.deleteEntriesForWeek(targetWeekStart, targetEnd)
      .then(() => db.upsertManyEntries(newEntries))
      .catch(console.error);
    void get().refreshAlerts();
  },

  setCurrentDate: (date) => set({ currentDate: date }),

  // ---- Settings ───────────────────────────────────────────
  updateSettings: async (updates) => {
    const prev = get().settings;
    const newSettings = { ...prev, ...updates };
    set({ settings: newSettings });
    try {
      await db.updateSettings(newSettings);
    } catch (err: unknown) {
      set({ settings: prev });
      const msg = supabaseErrorMessage(err);
      console.warn('[planning] Échec enregistrement des paramètres:', msg);
      toast.error(`Enregistrement impossible : ${msg}`);
      throw err;
    }
  },

  publishMonthForEmployees: async (monthKey) => {
    await db.publishMonthEntries(monthKey);
    const scheduleEntries = await db.getScheduleEntries();
    set({ scheduleEntries });
  },

  publishWeekForEmployees: async (weekStartMonday, weekEndSunday) => {
    await db.publishWeekEntries(weekStartMonday, weekEndSunday);
    const scheduleEntries = await db.getScheduleEntries();
    set({ scheduleEntries });
  },

  // ---- Alertes ────────────────────────────────────────────
  refreshAlerts: async () => {
    const { employees, shifts, scheduleEntries, settings } = get();
    const today = new Date();
    const appSettings = settings ?? defaultSettings;
    const alertWindow = getAlertWindow(today);
    const { rangeFrom, rangeTo } = getAvailabilityFetchRange(scheduleEntries, today);

    let resolvedAlertIds = get().resolvedAlertIds;
    try {
      resolvedAlertIds = await db.getResolvedPlanningAlertIds();
    } catch (err) {
      console.error('Alertes résolues (refresh) :', err);
    }

    let alerts: PlanningAlert[] = [];
    let availabilityStatusByKey = get().availabilityStatusByKey;
    try {
      const [requests, validations] = await Promise.all([
        db.getAvailabilityRequestsInRange(rangeFrom, rangeTo),
        db.getAvailabilityValidations(),
      ]);
      alerts = buildPlanningAlerts(
        employees,
        shifts,
        scheduleEntries,
        alertWindow,
        appSettings,
        requests,
        validations
      );
      availabilityStatusByKey = mergeAvailabilityWindowIntoMap(
        get().availabilityStatusByKey,
        rangeFrom,
        rangeTo,
        requests
      );
    } catch (err) {
      console.error('refreshAlerts : lecture disponibilités / validations', err);
      alerts = buildPlanningAlerts(
        employees,
        shifts,
        scheduleEntries,
        alertWindow,
        appSettings,
        [],
        []
      );
    }

    alerts = applyResolvedPlanningAlerts(alerts, resolvedAlertIds);
    alerts = await appendPunchAlerts(
      alerts,
      employees,
      shifts,
      scheduleEntries,
      appSettings,
      get().alerts,
      resolvedAlertIds
    );
    alerts = filterAlertsByNotifications(alerts, appSettings.notifications);

    set({ alerts, resolvedAlertIds, availabilityStatusByKey });
  },

  resolveAlert: (alertId) => {
    set((state) => ({
      resolvedAlertIds: state.resolvedAlertIds.includes(alertId)
        ? state.resolvedAlertIds
        : [...state.resolvedAlertIds, alertId],
      alerts: state.alerts.map((a) =>
        a.id === alertId ? { ...a, resolved: true } : a
      ),
    }));
    void db.markPlanningAlertResolved(alertId).catch((err) => {
      console.error('resolveAlert :', err);
      toast.error('Impossible d’enregistrer l’alerte comme résolue');
      set((state) => ({
        resolvedAlertIds: state.resolvedAlertIds.filter((id) => id !== alertId),
        alerts: state.alerts.map((a) =>
          a.id === alertId ? { ...a, resolved: false } : a
        ),
      }));
    });
  },

  resolveAlerts: (alertIds) => {
    if (alertIds.length === 0) return;
    const idSet = new Set(alertIds);
    set((state) => ({
      resolvedAlertIds: [...new Set([...state.resolvedAlertIds, ...alertIds])],
      alerts: state.alerts.map((a) =>
        idSet.has(a.id) ? { ...a, resolved: true } : a
      ),
    }));
    void db.markPlanningAlertsResolved(alertIds).catch((err) => {
      console.error('resolveAlerts :', err);
      toast.error('Impossible d’enregistrer les alertes comme résolues');
      set((state) => ({
        resolvedAlertIds: state.resolvedAlertIds.filter((id) => !idSet.has(id)),
        alerts: state.alerts.map((a) =>
          idSet.has(a.id) ? { ...a, resolved: false } : a
        ),
      }));
    });
  },

  // ---- Getters ────────────────────────────────────────────
  getEntryForCell: (employeeId, date) => {
    return get().scheduleEntries.find(
      (e) => e.employeeId === employeeId && e.date === date
    );
  },

  getShiftById: (shiftId) => {
    return get().shifts.find((s) => s.id === shiftId);
  },

  getEmployeeById: (employeeId) => {
    return get().employees.find((e) => e.id === employeeId);
  },

  getActiveEmployees: () => {
    return get().employees.filter((e) => e.isActive);
  },

  getActiveShifts: () => {
    return get().shifts.filter((s) => s.isActive);
  },

  getWeeklyHours: (employeeId, weekStart, weekEnd) => {
    const { scheduleEntries, shifts } = get();
    const shiftMap = new Map(shifts.map((s) => [s.id, s]));
    return scheduleEntries
      .filter(
        (e) =>
          e.employeeId === employeeId &&
          e.date >= weekStart &&
          e.date <= weekEnd
      )
      .reduce((total, entry) => {
        const shift = shiftMap.get(entry.shiftId);
        return total + getPlannedEntryDurationHours(entry, shift);
      }, 0);
  },

  getMonthlyHours: (employeeId, monthStart, monthEnd) => {
    const { scheduleEntries, shifts } = get();
    const shiftMap = new Map(shifts.map((s) => [s.id, s]));
    return scheduleEntries
      .filter(
        (e) =>
          e.employeeId === employeeId &&
          e.date >= monthStart &&
          e.date <= monthEnd
      )
      .reduce((total, entry) => {
        const shift = shiftMap.get(entry.shiftId);
        return total + getPlannedEntryDurationHours(entry, shift);
      }, 0);
  },

  getValidatedWeeklyHours: (employeeId, weekStart, weekEnd) => {
    const { scheduleEntries, settings } = get();
    const options = { deductBreaks: settings.deductBreaks === true };
    return scheduleEntries
      .filter(
        (e) =>
          e.employeeId === employeeId &&
          e.date >= weekStart &&
          e.date <= weekEnd
      )
      .reduce((total, entry) => total + getValidatedEntryDurationHours(entry, options), 0);
  },

  getValidatedMonthlyHours: (employeeId, monthStart, monthEnd) => {
    const { scheduleEntries, settings } = get();
    const options = { deductBreaks: settings.deductBreaks === true };
    return scheduleEntries
      .filter(
        (e) =>
          e.employeeId === employeeId &&
          e.date >= monthStart &&
          e.date <= monthEnd
      )
      .reduce((total, entry) => total + getValidatedEntryDurationHours(entry, options), 0);
  },

  getAvailabilityStatus: (employeeId, date) =>
    get().availabilityStatusByKey[availabilityMapKey(employeeId, date)],
}));
