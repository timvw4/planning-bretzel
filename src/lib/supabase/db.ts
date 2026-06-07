// ============================================================
// COUCHE D'ACCÈS AUX DONNÉES — Supabase
// Toutes les opérations CRUD vers la base de données
// ============================================================

import { createClient } from './client';
import { supabaseErrorMessage } from './errorMessage';
import { Employee, Shift, ScheduleEntry, AppSettings, WorkSiteGeofence, EmployeePosition } from '@/lib/types';
import { getPositionLabel, inferPositionFromLegacyRole, parseEmployeePosition, normalizeStoredAvailabilityStatus } from '@/lib/employeePosition';
import { normalizeContractType } from '@/lib/utils';
import { SWISS_DEFAULT_FULL_TIME_HOURS, SWISS_DEFAULT_MAX_WEEKLY_HOURS, SWISS_MIN_REST_HOURS } from '@/lib/swissLabor';
import { format, parse, startOfMonth, endOfMonth } from 'date-fns';

// ── Conversions Supabase (snake_case) ↔ App (camelCase) ──────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function dbToEmployee(row: any): Employee {
  const position: EmployeePosition = row.position
    ? parseEmployeePosition(row.position)
    : inferPositionFromLegacyRole(row.role);
  return {
    id: row.id,
    firstName: row.first_name ?? '',
    lastName: row.last_name ?? '',
    position,
    email: row.email ?? '',
    phone: row.phone ?? '',
    color: row.color ?? '#6366F1',
    availability: row.availability ?? [],
    contractType: normalizeContractType(row.contract_type),
    contractHours: row.contract_hours ?? SWISS_DEFAULT_FULL_TIME_HOURS,
    annualVacationDays: row.annual_vacation_days ?? 25,
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
    position: e.position,
    role: getPositionLabel(e.position),
    email: e.email,
    phone: e.phone,
    color: e.color,
    availability: e.availability,
    contract_type: e.contractType,
    contract_hours: e.contractHours,
    annual_vacation_days: e.annualVacationDays ?? 25,
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
  const workSite = ((): WorkSiteGeofence | null => {
    const la = row.work_site_latitude;
    const lo = row.work_site_longitude;
    const r = row.work_site_radius_m;
    if (la == null || lo == null || r == null) return null;
    const lat = typeof la === 'number' ? la : Number.parseFloat(String(la));
    const lng = typeof lo === 'number' ? lo : Number.parseFloat(String(lo));
    const radiusM = typeof r === 'number' ? r : Number.parseFloat(String(r));
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(radiusM) || radiusM <= 0) {
      return null;
    }
    return { lat, lng, radiusM };
  })();

  return {
    companyName: row.company_name ?? 'Mon Entreprise',
    weekStartDay: row.week_start_day ?? 1,
    minRestHours: row.min_rest_hours ?? SWISS_MIN_REST_HOURS,
    maxWeeklyHours: row.max_weekly_hours ?? SWISS_DEFAULT_MAX_WEEKLY_HOURS,
    locale: row.locale ?? 'fr-FR',
    timezone: row.timezone ?? 'Europe/Paris',
    theme: 'light',
    holidays: row.holidays ?? [],
    planningMonthMode: row.planning_month_mode ?? 'strict',
    notifications: row.notifications ?? {
      overtime: true,
      unavailable: true,
      lowRest: true,
      geofencePunch: true,
    },
    workSite,
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
    // Objets plain JSON pour éviter tout souci de sérialisation côté PostgREST
    const holidays = (settings.holidays ?? []).map((h) => ({
      date: String(h.date),
      name: String(h.name),
    }));
    const notifications = {
      overtime: Boolean(settings.notifications?.overtime ?? true),
      unavailable: Boolean(settings.notifications?.unavailable ?? true),
      lowRest: Boolean(settings.notifications?.lowRest ?? true),
      geofencePunch: Boolean(settings.notifications?.geofencePunch ?? true),
    };
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
        holidays,
        notifications,
        work_site_latitude: settings.workSite?.lat ?? null,
        work_site_longitude: settings.workSite?.lng ?? null,
        work_site_radius_m: settings.workSite?.radiusM ?? null,
        updated_at: new Date().toISOString(),
      })
      .not('id', 'is', null);
    if (error) {
      throw new Error(supabaseErrorMessage(error));
    }
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
      status: normalizeStoredAvailabilityStatus(String((r as { status?: string }).status ?? '')) ?? '',
    })).filter((r) => r.status === 'vacation' || r.status === 'unavailable');
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

  /** IDs d'alertes marquées résolues (persistées Supabase). */
  async getResolvedPlanningAlertIds(): Promise<string[]> {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('resolved_planning_alerts')
      .select('alert_id');
    if (error) throw error;
    return (data ?? []).map((r) => r.alert_id as string);
  },

  async markPlanningAlertResolved(alertId: string): Promise<void> {
    const supabase = createClient();
    const { data: userData } = await supabase.auth.getUser();
    const { error } = await supabase.from('resolved_planning_alerts').upsert(
      {
        alert_id: alertId,
        resolved_at: new Date().toISOString(),
        resolved_by: userData.user?.id ?? null,
      },
      { onConflict: 'alert_id' }
    );
    if (error) throw error;
  },

  async markPlanningAlertsResolved(alertIds: string[]): Promise<void> {
    if (alertIds.length === 0) return;
    const supabase = createClient();
    const { data: userData } = await supabase.auth.getUser();
    const now = new Date().toISOString();
    const rows = alertIds.map((alert_id) => ({
      alert_id,
      resolved_at: now,
      resolved_by: userData.user?.id ?? null,
    }));
    const { error } = await supabase
      .from('resolved_planning_alerts')
      .upsert(rows, { onConflict: 'alert_id' });
    if (error) throw error;
  },
};
