// ============================================================
// COUCHE D'ACCÈS AUX DONNÉES — Supabase
// Toutes les opérations CRUD vers la base de données
// ============================================================

import { createClient } from './client';
import { Employee, Shift, ScheduleEntry, AppSettings } from '@/lib/types';
import { format } from 'date-fns';

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
    const { data, error } = await supabase
      .from('schedule_entries')
      .select('*');
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
};
