/**
 * Pointages employés (clock in / clock out) — types et utilitaires partagés.
 */

import { format, parseISO, addHours, subHours, isBefore, isAfter } from 'date-fns';
import type { WorkSiteGeofence } from '@/lib/types';
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
  pause_15min: boolean;
  had_snack: boolean;
  ate_work_food: boolean;
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
 * GPS pour un pointage.
 * - Arrivée (requireInside: true) : position obligatoire ET à l'intérieur du cercle si périmètre actif.
 * - Départ (requireInside: false) : toujours autorisé ; enregistre si l'employé est dedans ou dehors.
 */
export async function resolvePunchGeolocation(
  workSite: WorkSiteGeofence | null,
  options?: { requireInside?: boolean }
): Promise<PunchGeoCols | 'blocked' | 'outside'> {
  const requireInside = options?.requireInside !== false;
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
