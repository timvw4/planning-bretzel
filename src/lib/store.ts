// ============================================================
// STORE ZUSTAND — Gestion d'état globale de l'application
// Les données sont synchronisées avec Supabase.
// Pattern : mise à jour optimiste locale + sync Supabase en arrière-plan
// ============================================================

import { create } from 'zustand';
import { Employee, Shift, ScheduleEntry, AppSettings, PlanningAlert, EmployeeGroup } from './types';
import { defaultSettings } from '@/data/mock';
import { buildPlanningAlerts, getAvailabilityFetchRange, getEntryDurationHours } from './utils';
import { db } from '@/lib/supabase/db';
import { format, startOfWeek, endOfWeek } from 'date-fns';

interface PlanningStore {
  // ---- Données ----
  employees: Employee[];
  shifts: Shift[];
  scheduleEntries: ScheduleEntry[];
  settings: AppSettings;
  alerts: PlanningAlert[];
  lockedMonths: string[];
  groups: EmployeeGroup[];
  isLoading: boolean;

  // ---- Vue planning ----
  currentDate: string;

  // ---- Chargement depuis Supabase ----
  loadData: () => Promise<void>;

  // ---- Actions Groupes ----
  addGroup: (name: string) => void;
  updateGroup: (id: string, name: string) => void;
  deleteGroup: (id: string) => void;
  setGroupMembers: (groupId: string, memberIds: string[]) => void;

  // ---- Actions Employés ----
  addEmployee: (employee: Omit<Employee, 'id' | 'createdAt'>) => void;
  updateEmployee: (id: string, updates: Partial<Employee>) => void;
  deleteEmployee: (id: string) => void;
  toggleMonthlyActive: (employeeId: string, monthKey: string) => void;

  // ---- Actions Shifts ----
  addShift: (shift: Omit<Shift, 'id'>) => void;
  updateShift: (id: string, updates: Partial<Shift>) => void;
  deleteShift: (id: string) => void;

  // ---- Actions Planning ----
  assignShift: (employeeId: string, date: string, shiftId: string, note?: string) => void;
  removeShift: (employeeId: string, date: string) => void;
  copyWeek: (sourceWeekStart: string, targetWeekStart: string) => void;
  setCurrentDate: (date: string) => void;

  // ---- Settings ----
  updateSettings: (updates: Partial<AppSettings>) => void;

  // ---- Validation des mois ----
  validateMonth: (monthKey: string) => void;
  unlockMonth: (monthKey: string) => void;
  isMonthLocked: (monthKey: string) => boolean;

  /** Publie le planning du mois : les employés voient les créneaux de cette plage. */
  publishMonthForEmployees: (monthKey: string) => Promise<void>;
  /** Publie la semaine (lundi → dimanche) : les employés voient ces jours. */
  publishWeekForEmployees: (weekStartMonday: string, weekEndSunday: string) => Promise<void>;

  // ---- Alertes ----
  refreshAlerts: () => Promise<void>;
  resolveAlert: (alertId: string) => void;

  // ---- Getters calculés ----
  getEntryForCell: (employeeId: string, date: string) => ScheduleEntry | undefined;
  getShiftById: (shiftId: string) => Shift | undefined;
  getEmployeeById: (employeeId: string) => Employee | undefined;
  getActiveEmployees: () => Employee[];
  getActiveShifts: () => Shift[];
  getWeeklyHours: (employeeId: string, weekStart: string, weekEnd: string) => number;
  getMonthlyHours: (employeeId: string, monthStart: string, monthEnd: string) => number;
}

export const usePlanningStore = create<PlanningStore>((set, get) => ({
  // ---- État initial ----
  employees: [],
  shifts: [],
  scheduleEntries: [],
  settings: defaultSettings,
  alerts: [],
  lockedMonths: [],
  groups: [],
  isLoading: true,
  currentDate: format(new Date(), 'yyyy-MM-dd'),

  // ---- Chargement depuis Supabase ─────────────────────────
  loadData: async () => {
    set({ isLoading: true });
    try {
      const [employees, shifts, entries, settings, lockedMonths, groups] = await Promise.all([
        db.getEmployees(),
        db.getShifts(),
        db.getScheduleEntries(),
        db.getSettings(),
        db.getLockedMonths(),
        db.getGroups().catch(() => [] as EmployeeGroup[]),
      ]);

      const today = new Date();
      const weekStart = format(startOfWeek(today, { weekStartsOn: 1 }), 'yyyy-MM-dd');
      const weekEnd = format(endOfWeek(today, { weekStartsOn: 1 }), 'yyyy-MM-dd');
      const { rangeFrom, rangeTo } = getAvailabilityFetchRange(entries, today);

      let alerts: PlanningAlert[] = [];
      try {
        const [requests, validations] = await Promise.all([
          db.getAvailabilityRequestsInRange(rangeFrom, rangeTo),
          db.getAvailabilityValidations(),
        ]);
        alerts = buildPlanningAlerts(
          employees,
          shifts,
          entries,
          weekStart,
          weekEnd,
          requests,
          validations
        );
      } catch (err) {
        console.error('loadData : disponibilités / validations (alertes partielles)', err);
        alerts = buildPlanningAlerts(employees, shifts, entries, weekStart, weekEnd, [], []);
      }

      set({
        employees,
        shifts,
        scheduleEntries: entries,
        settings: settings ?? defaultSettings,
        lockedMonths,
        groups,
        alerts,
        isLoading: false,
      });
    } catch (error) {
      console.error('Erreur lors du chargement des données:', error);
      set({ isLoading: false });
    }
  },

  // ---- Groupes ────────────────────────────────────────────
  addGroup: (name) => {
    const newGroup: EmployeeGroup = {
      id: crypto.randomUUID(),
      name,
      memberIds: [],
      createdAt: format(new Date(), 'yyyy-MM-dd'),
    };
    set((state) => ({ groups: [...state.groups, newGroup] }));
    db.upsertGroup({ id: newGroup.id, name: newGroup.name }).catch(console.error);
  },

  updateGroup: (id, name) => {
    set((state) => ({
      groups: state.groups.map((g) => (g.id === id ? { ...g, name } : g)),
    }));
    db.upsertGroup({ id, name }).catch(console.error);
  },

  deleteGroup: (id) => {
    set((state) => ({ groups: state.groups.filter((g) => g.id !== id) }));
    db.deleteGroup(id).catch(console.error);
  },

  setGroupMembers: (groupId, memberIds) => {
    set((state) => ({
      groups: state.groups.map((g) =>
        g.id === groupId ? { ...g, memberIds } : g
      ),
    }));
    db.setGroupMembers(groupId, memberIds).catch(console.error);
  },

  // ---- Employés ───────────────────────────────────────────
  addEmployee: (employeeData) => {
    const newEmployee: Employee = {
      ...employeeData,
      id: crypto.randomUUID(),
      createdAt: format(new Date(), 'yyyy-MM-dd'),
    };
    set((state) => ({ employees: [...state.employees, newEmployee] }));
    db.upsertEmployee(newEmployee).catch(console.error);
  },

  updateEmployee: (id, updates) => {
    set((state) => {
      const updated = state.employees.map((e) =>
        e.id === id ? { ...e, ...updates } : e
      );
      const employee = updated.find((e) => e.id === id);
      if (employee) db.upsertEmployee(employee).catch(console.error);
      return { employees: updated };
    });
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
  updateSettings: (updates) => {
    set((state) => {
      const newSettings = { ...state.settings, ...updates };
      db.updateSettings(newSettings).catch(console.error);
      return { settings: newSettings };
    });
  },

  // ---- Validation des mois ────────────────────────────────
  validateMonth: (monthKey) => {
    set((state) => ({
      lockedMonths: state.lockedMonths.includes(monthKey)
        ? state.lockedMonths
        : [...state.lockedMonths, monthKey],
    }));
    db.lockMonth(monthKey).catch(console.error);
  },

  unlockMonth: (monthKey) => {
    set((state) => ({
      lockedMonths: state.lockedMonths.filter((m) => m !== monthKey),
    }));
    db.unlockMonth(monthKey).catch(console.error);
  },

  isMonthLocked: (monthKey) => {
    return get().lockedMonths.includes(monthKey);
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
    const { employees, shifts, scheduleEntries } = get();
    const today = new Date();
    const weekStart = format(startOfWeek(today, { weekStartsOn: 1 }), 'yyyy-MM-dd');
    const weekEnd = format(endOfWeek(today, { weekStartsOn: 1 }), 'yyyy-MM-dd');
    const { rangeFrom, rangeTo } = getAvailabilityFetchRange(scheduleEntries, today);

    let alerts: PlanningAlert[] = [];
    try {
      const [requests, validations] = await Promise.all([
        db.getAvailabilityRequestsInRange(rangeFrom, rangeTo),
        db.getAvailabilityValidations(),
      ]);
      alerts = buildPlanningAlerts(
        employees,
        shifts,
        scheduleEntries,
        weekStart,
        weekEnd,
        requests,
        validations
      );
    } catch (err) {
      console.error('refreshAlerts : lecture disponibilités / validations', err);
      alerts = buildPlanningAlerts(employees, shifts, scheduleEntries, weekStart, weekEnd, [], []);
    }

    set({ alerts });
  },

  resolveAlert: (alertId) => {
    set((state) => ({
      alerts: state.alerts.map((a) =>
        a.id === alertId ? { ...a, resolved: true } : a
      ),
    }));
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
        return total + getEntryDurationHours(entry, shift);
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
        return total + getEntryDurationHours(entry, shift);
      }, 0);
  },
}));
