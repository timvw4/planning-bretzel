/**
 * Pointages employés (clock in / clock out) — types et utilitaires partagés.
 */

import { format, parseISO, addHours, subHours, subDays, isBefore, isAfter } from 'date-fns';
import { fr } from 'date-fns/locale';
import type { WorkSiteGeofence, Employee, PlanningAlert } from '@/lib/types';
import { isInsideGeofence } from '@/lib/geofence';
import { requestDevicePosition } from '@/lib/geolocation';
import type { SupabaseClient } from '@supabase/supabase-js';

export type PunchStatus = 'in_progress' | 'pending' | 'approved' | 'rejected' | 'auto_closed';
export type ApprovedTimeMode = 'planned' | 'actual';

export interface TimePunchRow {
  id: string;
  employee_id: string;
  date: string;
  planned_start: string | null;
  planned_end: string | null;
  clock_in_at: string | null;
  clock_out_at: string | null;
  actual_start: string | null;
  actual_end: string | null;
  approved_start_mode: ApprovedTimeMode | null;
  approved_end_mode: ApprovedTimeMode | null;
  status: PunchStatus;
  /** Ancienne case « pause de 15 min » ; conservée en phase avec pause_minutes. */
  pause_15min: boolean;
  /** Durée de pause déclarée, en minutes (barème LTr art. 15). */
  pause_minutes: number;
  had_snack: boolean;
  ate_work_food: boolean;
  /** Renseigné quand le pointage est archivé : il n'apparaît plus dans les écrans. */
  deleted_at?: string | null;
  auto_closed: boolean;
  admin_note: string | null;
  reviewed_at: string | null;
  note: string | null;
  clock_in_lat?: number | null;
  clock_in_lng?: number | null;
  clock_in_accuracy_m?: number | null;
  clock_in_inside_geofence?: boolean | null;
  clock_out_lat?: number | null;
  clock_out_lng?: number | null;
  clock_out_accuracy_m?: number | null;
  clock_out_inside_geofence?: boolean | null;
}

export type PunchGeoCols = {
  lat: number | null;
  lng: number | null;
  accuracy_m: number | null;
  inside_geofence: boolean | null;
};

const AUTO_CLOSE_HOURS = 12;

/** Shift affichable pour pointage : uniquement travail réel (pas OFF, congé, etc.). */
export function isDeclarableWorkShift(sh: {
  type?: string | null;
  short_name?: string | null;
}): boolean {
  const t = (sh.type ?? '').toString().trim().toLowerCase();
  if (t !== 'work') return false;
  const sn = (sh.short_name ?? '').trim().toUpperCase();
  if (sn === 'OFF') return false;
  return true;
}

/** Extrait HH:mm depuis un horodatage ISO. */
export function timestampToHHMM(iso: string): string {
  return format(parseISO(iso), 'HH:mm');
}

/** Construit un horodatage ISO depuis une date (YYYY-MM-DD) et une heure HH:mm. */
export function dateAndHHMMToISO(date: string, hhmm: string): string {
  return `${date}T${hhmm}:00`;
}

/** Statuts annulables par l'admin (erreur avant validation). */
export const ADMIN_CANCELLABLE_STATUSES: PunchStatus[] = [
  'in_progress',
  'pending',
  'auto_closed',
];

/** Met à jour les heures validées dans le planning réel après approbation. */
export async function syncScheduleFromApproved(
  supabase: SupabaseClient,
  employeeId: string,
  date: string,
  start: string,
  end: string,
  breakMinutes?: number
) {
  await supabase
    .from('schedule_entries')
    .update({
      validated_start: start,
      validated_end: end,
      validated_break_minutes: breakMinutes ?? null,
      is_modified: true,
    })
    .eq('employee_id', employeeId)
    .eq('date', date);
}

/** Compare l'heure actuelle à l'heure prévue (même jour, format HH:mm). */
export function canClockInNow(plannedStart: string, now: Date = new Date()): boolean {
  const [h, m] = plannedStart.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return true;
  const planned = new Date(now);
  planned.setHours(h, m, 0, 0);
  return !isBefore(now, planned);
}

/** Minutes jusqu'à l'heure de début prévue (0 si déjà passée). */
export function minutesUntilClockInAllowed(plannedStart: string, now: Date = new Date()): number {
  const [h, m] = plannedStart.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  const planned = new Date(now);
  planned.setHours(h, m, 0, 0);
  if (!isAfter(planned, now)) return 0;
  return Math.ceil((planned.getTime() - now.getTime()) / 60_000);
}

function hasActiveGeofence(workSite: WorkSiteGeofence | null): workSite is WorkSiteGeofence {
  return (
    workSite != null &&
    Number.isFinite(workSite.lat) &&
    Number.isFinite(workSite.lng) &&
    Number.isFinite(workSite.radiusM) &&
    workSite.radiusM > 0
  );
}

/**
 * GPS pour un pointage employé.
 * Par défaut le pointage est autorisé hors périmètre ; la position est enregistrée si disponible.
 * Option requireInside: true pour imposer le cercle (usage admin futur).
 */
export async function resolvePunchGeolocation(
  workSite: WorkSiteGeofence | null,
  options?: { requireInside?: boolean }
): Promise<PunchGeoCols | 'blocked' | 'outside'> {
  const requireInside = options?.requireInside === true;
  const empty: PunchGeoCols = {
    lat: null,
    lng: null,
    accuracy_m: null,
    inside_geofence: null,
  };

  const fenceActive = hasActiveGeofence(workSite);

  try {
    const p = await requestDevicePosition();
    if (!fenceActive) {
      return {
        lat: p.lat,
        lng: p.lng,
        accuracy_m: p.accuracyM,
        inside_geofence: null,
      };
    }
    const inside = isInsideGeofence(
      p.lat,
      p.lng,
      workSite!.lat,
      workSite!.lng,
      workSite!.radiusM
    );
    if (!inside && requireInside) return 'outside';
    return {
      lat: p.lat,
      lng: p.lng,
      accuracy_m: p.accuracyM,
      inside_geofence: inside,
    };
  } catch {
    return fenceActive && requireInside ? 'blocked' : empty;
  }
}

/** Convertit le résultat GPS en colonnes BDD (pointage autorisé même si GPS refusé ou hors zone). */
export function normalizePunchGeoResult(
  result: PunchGeoCols | 'blocked' | 'outside'
): PunchGeoCols {
  if (result === 'blocked' || result === 'outside') {
    return {
      lat: null,
      lng: null,
      accuracy_m: null,
      inside_geofence: null,
    };
  }
  return result;
}

/** Charge le périmètre depuis app_settings. */
export async function loadWorkSiteFence(
  supabase: SupabaseClient
): Promise<WorkSiteGeofence | null> {
  const { data } = await supabase
    .from('app_settings')
    .select('work_site_latitude, work_site_longitude, work_site_radius_m')
    .maybeSingle();
  if (!data) return null;
  const row = data as Record<string, unknown>;
  const lat = Number(row['work_site_latitude']);
  const lng = Number(row['work_site_longitude']);
  const radiusM = Number(row['work_site_radius_m']);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(radiusM) || radiusM <= 0) {
    return null;
  }
  return { lat, lng, radiusM };
}

/**
 * Clôture automatique après 12 h sans sortie.
 * Retourne le nombre de pointages clôturés.
 */
export async function runAutoCloseStalePunches(
  supabase: SupabaseClient,
  employeeId?: string
): Promise<number> {
  const cutoff = subHours(new Date(), AUTO_CLOSE_HOURS).toISOString();

  let query = supabase
    .from('time_declarations')
    .select('id, clock_in_at')
    .eq('status', 'in_progress')
    .is('deleted_at', null)
    .not('clock_in_at', 'is', null)
    .lt('clock_in_at', cutoff);

  if (employeeId) {
    query = query.eq('employee_id', employeeId);
  }

  const { data: stale, error } = await query;
  if (error || !stale?.length) return 0;

  let closed = 0;
  for (const row of stale) {
    const clockIn = row.clock_in_at as string;
    const autoOut = addHours(parseISO(clockIn), AUTO_CLOSE_HOURS).toISOString();
    const { error: updErr } = await supabase
      .from('time_declarations')
      .update({
        clock_out_at: autoOut,
        auto_closed: true,
        status: 'auto_closed',
      })
      .eq('id', row.id);
    if (!updErr) closed += 1;
  }
  return closed;
}

/** Heures pointées (réelles) au format HH:mm. */
export function getClockedTimes(punch: TimePunchRow): {
  clockIn: string | null;
  clockOut: string | null;
} {
  return {
    clockIn: punch.clock_in_at ? timestampToHHMM(punch.clock_in_at) : null,
    clockOut: punch.clock_out_at ? timestampToHHMM(punch.clock_out_at) : null,
  };
}

/** Calcule les heures finales selon le choix admin. */
export function resolveApprovedTimes(
  punch: TimePunchRow,
  startMode: ApprovedTimeMode,
  endMode: ApprovedTimeMode,
  adminOverrides?: { start?: string; end?: string }
): { start: string; end: string } {
  const { clockIn, clockOut } = getClockedTimes(punch);

  let start =
    startMode === 'planned'
      ? punch.planned_start ?? clockIn ?? '08:00'
      : clockIn ?? punch.planned_start ?? '08:00';

  let end =
    endMode === 'planned'
      ? punch.planned_end ?? clockOut ?? '16:00'
      : clockOut ?? punch.planned_end ?? '16:00';

  if (adminOverrides?.start) start = adminOverrides.start;
  if (adminOverrides?.end) end = adminOverrides.end;

  return { start, end };
}

export const PUNCH_STATUS_LABEL: Record<PunchStatus, string> = {
  in_progress: 'En service',
  pending: 'En attente',
  approved: 'Approuvé',
  rejected: 'Refusé',
  auto_closed: 'Clôture auto (12 h)',
};

/** Statuts visibles dans le badge admin « à traiter ». */
export const ADMIN_ACTION_STATUSES: PunchStatus[] = ['pending', 'auto_closed'];

/** Statuts chargés en priorité sur la page Pointages (sans limite). */
export const ADMIN_PRIORITY_PUNCH_STATUSES: PunchStatus[] = [
  ...ADMIN_ACTION_STATUSES,
  'in_progress',
];

/** Compte les pointages à traiter (même logique que l’onglet « À traiter »). */
export async function countPunchesAwaitingReview(
  supabase: SupabaseClient
): Promise<number> {
  const { count, error } = await supabase
    .from('time_declarations')
    .select('*', { count: 'exact', head: true })
    .in('status', ADMIN_ACTION_STATUSES)
    .is('deleted_at', null);
  if (error) {
    console.error(error);
    return 0;
  }
  return count ?? 0;
}

export const POINTAGES_REVIEW_UPDATED_EVENT = 'pointages-review-updated';

/** Notifie la sidebar (et autres vues) que la liste « À traiter » a changé. */
export function notifyPointagesReviewUpdated(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(POINTAGES_REVIEW_UPDATED_EVENT));
}

const GEOFENCE_ALERT_DAYS = 30;

/** Alertes cloche pour les pointages hors périmètre GPS (entrée ou sortie). */
export async function fetchGeofencePunchAlerts(
  supabase: SupabaseClient,
  employees: Employee[],
  daysBack = GEOFENCE_ALERT_DAYS
): Promise<PlanningAlert[]> {
  const since = format(subDays(new Date(), daysBack), 'yyyy-MM-dd');
  const empMap = new Map(employees.map((e) => [e.id, e]));

  const { data, error } = await supabase
    .from('time_declarations')
    .select(
      'id, employee_id, date, clock_in_at, clock_out_at, clock_in_inside_geofence, clock_out_inside_geofence'
    )
    .gte('date', since)
    .is('deleted_at', null)
    .or('clock_in_inside_geofence.eq.false,clock_out_inside_geofence.eq.false')
    .order('date', { ascending: false })
    .limit(100);

  if (error) {
    console.error(error);
    return [];
  }

  const alerts: PlanningAlert[] = [];

  for (const row of data ?? []) {
    const emp = empMap.get(row.employee_id);
    const name = emp
      ? `${emp.firstName}${emp.lastName ? ` ${emp.lastName}` : ''}`
      : 'Un employé';
    const dateLabel = format(parseISO(row.date), 'd MMMM', { locale: fr });

    if (row.clock_in_inside_geofence === false && row.clock_in_at) {
      alerts.push({
        id: `geofence-in-${row.id}`,
        type: 'geofence_clock_in',
        severity: 'error',
        message: `${name} a pointé son arrivée hors du périmètre GPS le ${dateLabel}`,
        employeeId: row.employee_id,
        date: row.date,
        resolved: false,
      });
    }

    if (row.clock_out_inside_geofence === false && row.clock_out_at) {
      alerts.push({
        id: `geofence-out-${row.id}`,
        type: 'geofence_clock_out',
        severity: 'error',
        message: `${name} a pointé son départ hors du périmètre GPS le ${dateLabel}`,
        employeeId: row.employee_id,
        date: row.date,
        resolved: false,
      });
    }
  }

  return alerts;
}

/** Jours passés examinés pour repérer les journées non pointées. */
const MISSING_PUNCH_ALERT_DAYS = 21;

/**
 * Alertes cloche : journée de travail planifiée dans le passé pour laquelle
 * aucun pointage n'existe. La journée du jour est exclue (elle n'est pas
 * terminée), et les journées déjà validées à la main dans le planning réel
 * ne remontent pas non plus.
 */
export async function fetchMissingPunchAlerts(
  supabase: SupabaseClient,
  employees: Employee[],
  plannedWorkDays: { employeeId: string; date: string; validated: boolean }[],
  daysBack = MISSING_PUNCH_ALERT_DAYS
): Promise<PlanningAlert[]> {
  const today = format(new Date(), 'yyyy-MM-dd');
  const since = format(subDays(new Date(), daysBack), 'yyyy-MM-dd');

  const candidates = plannedWorkDays.filter(
    (d) => !d.validated && d.date >= since && d.date < today
  );
  if (candidates.length === 0) return [];

  const { data, error } = await supabase
    .from('time_declarations')
    .select('employee_id, date')
    .gte('date', since)
    .lt('date', today)
    .is('deleted_at', null);

  if (error) {
    console.error(error);
    return [];
  }

  const punched = new Set(
    (data ?? []).map((row) => `${row.employee_id}|${row.date}`)
  );
  const empMap = new Map(employees.map((e) => [e.id, e]));
  const alerts: PlanningAlert[] = [];

  for (const day of candidates) {
    if (punched.has(`${day.employeeId}|${day.date}`)) continue;
    const emp = empMap.get(day.employeeId);
    // Un employé parti ne pointera jamais ses anciennes journées : inutile
    // d'encombrer la cloche avec ça.
    if (!emp || !emp.isActive) continue;

    alerts.push({
      id: `missing-punch-${day.employeeId}-${day.date}`,
      type: 'missing_punch',
      severity: 'warning',
      message: `${emp.firstName} ${emp.lastName} était planifié(e) le ${format(parseISO(day.date), 'd MMMM', { locale: fr })} sans aucun pointage`,
      employeeId: day.employeeId,
      date: day.date,
      resolved: false,
    });
  }

  return alerts;
}

export type GeofenceCheck = boolean | null | undefined;

export interface GeofenceDisplay {
  label: string;
  shortLabel: string;
  className: string;
  variant: 'inside' | 'outside' | 'unknown';
}

/** Libellé admin pour le GPS à l’entrée ou à la sortie. */
export function geofencePunchDisplay(
  inside: GeofenceCheck,
  kind: 'in' | 'out'
): GeofenceDisplay {
  const prefix = kind === 'in' ? 'Entrée' : 'Sortie';
  if (inside === true) {
    return {
      label: `${prefix} : dans le périmètre`,
      shortLabel: `${prefix} · OK`,
      className:
        'bg-emerald-50 text-emerald-800 border-emerald-200',
      variant: 'inside',
    };
  }
  if (inside === false) {
    return {
      label: `${prefix} : hors périmètre`,
      shortLabel: `${prefix} · Hors zone`,
      className: 'bg-red-50 text-red-700 border-red-200',
      variant: 'outside',
    };
  }
  return {
    label: `${prefix} : GPS non vérifié`,
    shortLabel: `${prefix} · N/A`,
    className: 'bg-slate-50 text-slate-500 border-slate-200',
    variant: 'unknown',
  };
}

/** L’admin peut valider ou modifier tant que le pointage n’est pas approuvé. */
export function adminCanEditPunch(
  punch: Pick<TimePunchRow, 'clock_in_at' | 'status'>
): boolean {
  if (punch.status === 'approved') return false;
  return Boolean(punch.clock_in_at);
}

/** Résumé d’un jour pour les options repas / pause (fin de service). */
export interface DeclarationDaySummary {
  date: string;
  pause_15min: boolean;
  had_snack: boolean;
  ate_work_food: boolean;
}

/** Compteurs agrégés sur une période (jours avec fin de service enregistrée). */
export interface DeclarationStats {
  totalDays: number;
  ateWorkFoodCount: number;
  hadSnackCount: number;
  pause15minCount: number;
  noPause15minCount: number;
  days: DeclarationDaySummary[];
}

type DeclarationStatsRow = Pick<
  TimePunchRow,
  'date' | 'pause_15min' | 'had_snack' | 'ate_work_food' | 'clock_out_at'
>;

/** Calcule les totaux repas / collation / pause à partir des pointages terminés. */
export function aggregateDeclarationStats(rows: DeclarationStatsRow[]): DeclarationStats {
  const completed = rows.filter((r) => r.clock_out_at);
  const days: DeclarationDaySummary[] = completed.map((r) => ({
    date: r.date,
    pause_15min: r.pause_15min ?? true,
    had_snack: r.had_snack ?? false,
    ate_work_food: r.ate_work_food ?? false,
  }));

  return {
    totalDays: days.length,
    ateWorkFoodCount: days.filter((d) => d.ate_work_food).length,
    hadSnackCount: days.filter((d) => d.had_snack).length,
    pause15minCount: days.filter((d) => d.pause_15min).length,
    noPause15minCount: days.filter((d) => !d.pause_15min).length,
    days: days.sort((a, b) => b.date.localeCompare(a.date)),
  };
}
