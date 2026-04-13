// ============================================================
// COUCHE D'ACCÈS AUX DONNÉES — Supabase
// Toutes les opérations CRUD vers la base de données
// ============================================================

import { createClient } from './client';
import { Employee, Shift, ScheduleEntry, AppSettings, EmployeeGroup } from '@/lib/types';
import { format, parse, startOfMonth, endOfMonth } from 'date-fns';

// ── Conversions Supabase (snake_case) ↔ App (camelCase) ──────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function dbToEmployee(row: any): Employee {
  return {
    id: row.id,
    firstName: row.first_name ?? '',
    lastName: row.last_name ?? '',
    role: row.role ?? '',
    email: row.email ?? '',
    phone: row.phone ?? '',
    color: row.color ?? '#6366F1',
    availability: row.availability ?? [],
    contractType: row.contract_type ?? 'full-time',
    contractHours: row.contract_hours ?? 35,
    notes: row.notes ?? '',
    isActive: row.is_active ?? true,
    inactiveMonths: row.inactive_months ?? [],
    createdAt: row.created_at ? format(new Date(row.created_at), 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'),
  };
}

function employeeToDb(e: Employee) {
  return {
    id: e.id,
    first_name: e.firstName,
    last_name: e.lastName,
    role: e.role,
    email: e.email,
    phone: e.phone,
    color: e.color,
    availability: e.availability,
    contract_type: e.contractType,
    contract_hours: e.contractHours,
    notes: e.notes,
    is_active: e.isActive,
    inactive_months: e.inactiveMonths,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function dbToShift(row: any): Shift {
  return {
    id: row.id,
    name: row.name,
    shortName: row.short_name,
    type: row.type ?? 'work',
    startTime: row.start_time ?? '',
    endTime: row.end_time ?? '',
    color: row.color,
    textColor: row.text_color,
    durationHours: row.duration_hours ?? 0,
    description: row.description ?? '',
    isActive: row.is_active ?? true,
  };
}

function shiftToDb(s: Shift) {
  return {
    id: s.id,
    name: s.name,
    short_name: s.shortName,
    type: s.type,
    start_time: s.startTime,
    end_time: s.endTime,
    color: s.color,
    text_color: s.textColor,
    duration_hours: s.durationHours,
    description: s.description ?? '',
    is_active: s.isActive,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function dbToEntry(row: any): ScheduleEntry {
  return {
    id: row.id,
    employeeId: row.employee_id,
    shiftId: row.shift_id,
    date: typeof row.date === 'string' && row.date.length === 10
      ? row.date
      : format(new Date(row.date), 'yyyy-MM-dd'),
    note: row.note ?? '',
    isModified: row.is_modified ?? false,
    // Sans colonne (anciennes bases) : comportement historique = visible
    visibleToEmployee: row.visible_to_employee ?? true,
    validatedStart: row.validated_start ?? null,
    validatedEnd: row.validated_end ?? null,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function dbToSettings(row: any): AppSettings {
  return {
    companyName: row.company_name ?? 'Mon Entreprise',
    weekStartDay: row.week_start_day ?? 1,
    minRestHours: row.min_rest_hours ?? 11,
    maxWeeklyHours: row.max_weekly_hours ?? 48,
    locale: row.locale ?? 'fr-FR',
    timezone: row.timezone ?? 'Europe/Paris',
    theme: 'light',
    holidays: row.holidays ?? [],
    planningMonthMode: row.planning_month_mode ?? 'strict',
    notifications: row.notifications ?? {
      overtime: true,
      unavailable: true,
      lowRest: true,
      weeklyReport: false,
    },
  };
}

// ── Opérations base de données ────────────────────────────────

export const db = {

  // ── Employés ───────────────────────────────────────────────
  async getEmployees(): Promise<Employee[]> {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('employees')
      .select('*')
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data ?? []).map(dbToEmployee);
  },

  async upsertEmployee(e: Employee): Promise<void> {
    const supabase = createClient();
    const { error } = await supabase
      .from('employees')
      .upsert(employeeToDb(e));
    if (error) throw error;
  },

  async deleteEmployee(id: string): Promise<void> {
    const supabase = createClient();
    const { error } = await supabase
      .from('employees')
      .delete()
      .eq('id', id);
    if (error) throw error;
  },

  // ── Shifts ─────────────────────────────────────────────────
  async getShifts(): Promise<Shift[]> {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('shifts')
      .select('*')
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data ?? []).map(dbToShift);
  },

  async upsertShift(s: Shift): Promise<void> {
    const supabase = createClient();
    const { error } = await supabase
      .from('shifts')
      .upsert(shiftToDb(s));
    if (error) throw error;
  },

  async deleteShift(id: string): Promise<void> {
    const supabase = createClient();
    const { error } = await supabase
      .from('shifts')
      .delete()
      .eq('id', id);
    if (error) throw error;
  },

  // ── Planning ───────────────────────────────────────────────
  async getScheduleEntries(): Promise<ScheduleEntry[]> {
    const supabase = createClient();
    const { data, error } = await supabase.from('schedule_entries').select(
      'id, employee_id, shift_id, date, note, is_modified, visible_to_employee, validated_start, validated_end'
    );
    if (error) throw error;
    return (data ?? []).map(dbToEntry);
  },

  async upsertEntry(entry: ScheduleEntry): Promise<void> {
    const supabase = createClient();
    const { error } = await supabase
      .from('schedule_entries')
      .upsert(
        {
          id: entry.id,
          employee_id: entry.employeeId,
          shift_id: entry.shiftId,
          date: entry.date,
          note: entry.note ?? '',
          is_modified: entry.isModified ?? false,
          visible_to_employee: entry.visibleToEmployee,
          validated_start: entry.validatedStart ?? null,
          validated_end: entry.validatedEnd ?? null,
        },
        { onConflict: 'employee_id,date' }
      );
    if (error) throw error;
  },

  async removeEntry(employeeId: string, date: string): Promise<void> {
    const supabase = createClient();
    const { error } = await supabase
      .from('schedule_entries')
      .delete()
      .eq('employee_id', employeeId)
      .eq('date', date);
    if (error) throw error;
  },

  async deleteEntriesForEmployee(employeeId: string): Promise<void> {
    const supabase = createClient();
    await supabase
      .from('schedule_entries')
      .delete()
      .eq('employee_id', employeeId);
  },

  async upsertManyEntries(entries: ScheduleEntry[]): Promise<void> {
    if (entries.length === 0) return;
    const supabase = createClient();
    const { error } = await supabase
      .from('schedule_entries')
      .upsert(
        entries.map((e) => ({
          id: e.id,
          employee_id: e.employeeId,
          shift_id: e.shiftId,
          date: e.date,
          note: e.note ?? '',
          is_modified: e.isModified ?? false,
          visible_to_employee: e.visibleToEmployee,
          validated_start: e.validatedStart ?? null,
          validated_end: e.validatedEnd ?? null,
        })),
        { onConflict: 'employee_id,date' }
      );
    if (error) throw error;
  },

  async deleteEntriesForWeek(weekStart: string, weekEnd: string): Promise<void> {
    const supabase = createClient();
    await supabase
      .from('schedule_entries')
      .delete()
      .gte('date', weekStart)
      .lte('date', weekEnd);
  },

  // ── Paramètres ─────────────────────────────────────────────
  async getSettings(): Promise<AppSettings | null> {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('app_settings')
      .select('*')
      .single();
    if (error) return null;
    return dbToSettings(data);
  },

  async updateSettings(settings: AppSettings): Promise<void> {
    const supabase = createClient();
    const { error } = await supabase
      .from('app_settings')
      .update({
        company_name: settings.companyName,
        week_start_day: settings.weekStartDay,
        min_rest_hours: settings.minRestHours,
        max_weekly_hours: settings.maxWeeklyHours,
        locale: settings.locale,
        timezone: settings.timezone,
        planning_month_mode: settings.planningMonthMode,
        holidays: settings.holidays,
        notifications: settings.notifications,
        updated_at: new Date().toISOString(),
      })
      .not('id', 'is', null);
    if (error) throw error;
  },

  // ── Mois verrouillés ───────────────────────────────────────
  async getLockedMonths(): Promise<string[]> {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('locked_months')
      .select('month_key');
    if (error) return [];
    return (data ?? []).map((r) => r.month_key);
  },

  async lockMonth(monthKey: string): Promise<void> {
    const supabase = createClient();
    await supabase
      .from('locked_months')
      .upsert({ month_key: monthKey });
  },

  async unlockMonth(monthKey: string): Promise<void> {
    const supabase = createClient();
    await supabase
      .from('locked_months')
      .delete()
      .eq('month_key', monthKey);
  },

  /** Rend visibles pour les employés toutes les entrées du mois calendaire (yyyy-MM). */
  async publishMonthEntries(monthKey: string): Promise<void> {
    const supabase = createClient();
    const d = parse(`${monthKey}-01`, 'yyyy-MM-dd', new Date());
    const start = format(startOfMonth(d), 'yyyy-MM-dd');
    const end = format(endOfMonth(d), 'yyyy-MM-dd');
    const { error } = await supabase
      .from('schedule_entries')
      .update({ visible_to_employee: true })
      .gte('date', start)
      .lte('date', end);
    if (error) throw error;
  },

  /** Rend visibles pour les employés toutes les entrées entre deux dates incluses (lundi–dimanche). */
  async publishWeekEntries(weekStartMonday: string, weekEndSunday: string): Promise<void> {
    const supabase = createClient();
    const { error } = await supabase
      .from('schedule_entries')
      .update({ visible_to_employee: true })
      .gte('date', weekStartMonday)
      .lte('date', weekEndSunday);
    if (error) throw error;
  },

  // ── Disponibilités employés (alertes admin) ─────────────────
  async getAvailabilityRequestsInRange(
    dateFrom: string,
    dateTo: string
  ): Promise<{ employeeId: string; date: string; status: string }[]> {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('availability_requests')
      .select('employee_id, date, status')
      .gte('date', dateFrom)
      .lte('date', dateTo);
    if (error) throw error;
    return (data ?? []).map((r) => ({
      employeeId: r.employee_id as string,
      date:
        typeof r.date === 'string' && (r.date as string).length === 10
          ? (r.date as string)
          : format(new Date(r.date as string), 'yyyy-MM-dd'),
      status: String((r as { status?: string }).status ?? ''),
    }));
  },

  async getAvailabilityValidations(): Promise<{ employeeId: string; monthKey: string }[]> {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('availability_validations')
      .select('employee_id, month_key');
    if (error) throw error;
    return (data ?? []).map((r) => ({
      employeeId: r.employee_id as string,
      monthKey: r.month_key as string,
    }));
  },

  // ── Groupes d'employés ─────────────────────────────────────
  async getGroups(): Promise<EmployeeGroup[]> {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('employee_groups')
      .select('id, name, created_at, employee_group_members(employee_id)')
      .order('created_at', { ascending: true });
    if (error) throw error;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data ?? []).map((row: any) => ({
      id: row.id as string,
      name: row.name as string,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      memberIds: ((row.employee_group_members ?? []) as any[]).map((m: any) => m.employee_id as string),
      createdAt: row.created_at ? format(new Date(row.created_at), 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'),
    }));
  },

  async upsertGroup(g: Pick<EmployeeGroup, 'id' | 'name'>): Promise<void> {
    const supabase = createClient();
    const { error } = await supabase
      .from('employee_groups')
      .upsert({ id: g.id, name: g.name });
    if (error) throw error;
  },

  async deleteGroup(id: string): Promise<void> {
    const supabase = createClient();
    const { error } = await supabase
      .from('employee_groups')
      .delete()
      .eq('id', id);
    if (error) throw error;
  },

  async setGroupMembers(groupId: string, memberIds: string[]): Promise<void> {
    const supabase = createClient();
    // Supprimer les anciens membres, puis insérer les nouveaux
    const { error: delError } = await supabase
      .from('employee_group_members')
      .delete()
      .eq('group_id', groupId);
    if (delError) throw delError;
    if (memberIds.length === 0) return;
    const rows = memberIds.map((employeeId) => ({ group_id: groupId, employee_id: employeeId }));
    const { error: insError } = await supabase
      .from('employee_group_members')
      .insert(rows);
    if (insError) throw insError;
  },
};
