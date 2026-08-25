import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import {
  format,
  parseISO,
  differenceInMinutes,
  addMinutes,
  parse,
  isWeekend,
  isToday,
  addMonths,
  subMonths,
  addDays,
  subDays,
  startOfWeek,
} from 'date-fns';
import { fr } from 'date-fns/locale';
import {
  Employee,
  Shift,
  ScheduleEntry,
  PlanningAlert,
  DayColumn,
  type AppSettings,
  type ContractType,
  type NotificationSettings,
} from './types';
import { isBreakBelowLegal, legalBreakMinutes, netWorkedHours } from './swissBreaks';
import { SWISS_MIN_REST_HOURS } from './swissLabor';

// Utilitaire Tailwind + clsx
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ---- DATES ----
export function formatDate(date: Date | string, fmt: string = 'd MMMM yyyy'): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, fmt, { locale: fr });
}

export function formatShortDate(date: Date | string): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, 'EEE d', { locale: fr });
}

export function buildDayColumns(dates: Date[]): DayColumn[] {
  return dates.map((d) => ({
    date: format(d, 'yyyy-MM-dd'),
    dayName: format(d, 'EEE', { locale: fr }),
    dayNumber: d.getDate(),
    isToday: isToday(d),
    isWeekend: isWeekend(d),
    isHoliday: false, // À étendre avec vraies fériés
  }));
}

// ---- HEURES ----
export function calculateShiftDuration(startTime: string, endTime: string): number {
  if (startTime === '00:00' && endTime === '00:00') return 0;

  const baseDate = new Date(2000, 0, 1);
  const start = parse(startTime, 'HH:mm', baseDate);
  let end = parse(endTime, 'HH:mm', baseDate);

  // Si fin < début → shift de nuit (passage minuit)
  if (end <= start) {
    end = addMinutes(end, 24 * 60);
  }

  return differenceInMinutes(end, start) / 60;
}

/**
 * Plage horaire affichée pour une case planning : heures validées si présentes, sinon le modèle de shift.
 * À utiliser pour le planning réel et les vues qui doivent refléter les heures approuvées.
 */
export function getEntryDisplayTimeRange(
  entry: ScheduleEntry | undefined,
  shift: Shift | undefined
): { start: string; end: string } {
  if (!shift) return { start: '', end: '' };
  const vs = entry?.validatedStart;
  const ve = entry?.validatedEnd;
  if (vs && ve) return { start: vs, end: ve };
  return { start: shift.startTime, end: shift.endTime };
}

/** Horaires prévus du modèle de shift (vue planning prévisionnel admin). */
export function getPlannedShiftTimeRange(shift: Shift | undefined): {
  start: string;
  end: string;
} {
  if (!shift) return { start: '', end: '' };
  return { start: shift.startTime, end: shift.endTime };
}

export function hasValidatedTimes(entry: ScheduleEntry | undefined): boolean {
  return Boolean(entry?.validatedStart && entry?.validatedEnd);
}

export function getValidatedTimeRange(entry: ScheduleEntry): {
  start: string;
  end: string;
} {
  return {
    start: entry.validatedStart ?? '',
    end: entry.validatedEnd ?? '',
  };
}

/**
 * Options de comptage des heures.
 * `deductBreaks` reflète le réglage « déduire les pauses des heures
 * payées » : laissé à faux, le total reste la simple amplitude fin − début.
 */
export interface HoursCountingOptions {
  deductBreaks?: boolean;
}

/** Durée brute validée (amplitude fin − début), sans tenir compte de la pause. */
export function getValidatedEntryGrossHours(entry: ScheduleEntry): number {
  if (!entry.validatedStart || !entry.validatedEnd) return 0;
  return calculateShiftDuration(entry.validatedStart, entry.validatedEnd);
}

/** Pause retenue sur une journée validée, en minutes (0 si non renseignée). */
export function getEntryBreakMinutes(entry: ScheduleEntry): number {
  const m = entry.validatedBreakMinutes;
  return typeof m === 'number' && m > 0 ? m : 0;
}

/** Durée (heures) pour une entrée : validée si renseignée, sinon durée du shift. */
export function getEntryDurationHours(
  entry: ScheduleEntry,
  shift: Shift | undefined,
  options?: HoursCountingOptions
): number {
  if (!shift) return 0;
  if (entry.validatedStart && entry.validatedEnd) {
    return getValidatedEntryDurationHours(entry, options);
  }
  return shift.durationHours ?? 0;
}

/** Durée prévue (modèle shift), ignore les heures validées. */
export function getPlannedEntryDurationHours(
  entry: ScheduleEntry,
  shift: Shift | undefined
): number {
  if (!shift) return 0;
  return shift.durationHours ?? 0;
}

/** Heures payées d’une journée validée ; 0 si le jour n’est pas validé. */
export function getValidatedEntryDurationHours(
  entry: ScheduleEntry,
  options?: HoursCountingOptions
): number {
  const gross = getValidatedEntryGrossHours(entry);
  if (gross === 0) return 0;
  return netWorkedHours(gross, getEntryBreakMinutes(entry), options?.deductBreaks === true);
}

/** Début du shift sur le jour `dateStr` (heure locale). */
export function getShiftStartDateTime(dateStr: string, startTime: string): Date {
  const day = parse(dateStr, 'yyyy-MM-dd', new Date());
  const t =
    startTime && startTime.trim().length >= 4 ? startTime.trim().slice(0, 5) : '00:00';
  return parse(t, 'HH:mm', day);
}

/**
 * Fin du shift sur le calendrier (jour suivant si le shift passe minuit).
 * Aligné sur la logique de `calculateShiftDuration`.
 */
export function getShiftEndDateTime(dateStr: string, startTime: string, endTime: string): Date {
  const day = parse(dateStr, 'yyyy-MM-dd', new Date());
  const st =
    startTime && startTime.trim().length >= 4 ? startTime.trim().slice(0, 5) : '00:00';
  const et =
    endTime && endTime.trim().length >= 4 ? endTime.trim().slice(0, 5) : '23:59';
  const start = parse(st, 'HH:mm', day);
  let end = parse(et, 'HH:mm', day);
  if (end <= start) {
    end = addDays(end, 1);
  }
  return end;
}

/** Premier shift « travail » dont la fin est encore après `now` (tri par début). */
export function getNextUpcomingWorkEntry<
  T extends { date: string; shift: { type: string; startTime: string; endTime: string } },
>(entries: T[], now: Date): T | undefined {
  const work = entries.filter((e) => e.shift.type === 'work');
  const sorted = [...work].sort(
    (a, b) =>
      getShiftStartDateTime(a.date, a.shift.startTime).getTime() -
      getShiftStartDateTime(b.date, b.shift.startTime).getTime()
  );
  return sorted.find(
    (e) => getShiftEndDateTime(e.date, e.shift.startTime, e.shift.endTime) > now
  );
}

export function formatHours(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (m === 0) return `${h}h`;
  return `${h}h${m.toString().padStart(2, '0')}`;
}

// ---- ALERTES PLANNING ----
/** Plage de dates surveillée par la détection d’alertes (bornes incluses). */
export interface AlertWindow {
  from: string;
  to: string;
}

/** Réglages dont la détection d’alertes a besoin. */
export type AlertSettings = Pick<AppSettings, 'minRestHours' | 'maxWeeklyHours'>;

const DAY_NAMES: Record<number, string> = {
  0: 'sunday',
  1: 'monday',
  2: 'tuesday',
  3: 'wednesday',
  4: 'thursday',
  5: 'friday',
  6: 'saturday',
};

/** Lundi de la semaine contenant `date`, au format yyyy-MM-dd. */
function mondayOf(date: string): string {
  return format(startOfWeek(parseISO(date), { weekStartsOn: 1 }), 'yyyy-MM-dd');
}

/**
 * Alertes planning sur toute la plage demandée : dépassement d’heures
 * (semaine par semaine), jour non disponible, repos trop court.
 *
 * Le repos est calculé sur de vraies dates-heures, ce qui tient compte des
 * minutes, des services qui passent minuit et des jours non consécutifs.
 */
export function detectScheduleAlerts(
  entries: ScheduleEntry[],
  employees: Employee[],
  shifts: Shift[],
  window: AlertWindow,
  settings: AlertSettings
): PlanningAlert[] {
  const alerts: PlanningAlert[] = [];
  const shiftMap = new Map(shifts.map((s) => [s.id, s]));
  const minRestHours =
    Number.isFinite(settings.minRestHours) && settings.minRestHours > 0
      ? settings.minRestHours
      : SWISS_MIN_REST_HOURS;
  const legalWeeklyMax =
    Number.isFinite(settings.maxWeeklyHours) && settings.maxWeeklyHours > 0
      ? settings.maxWeeklyHours
      : 0;

  const isWorkEntry = (entry: ScheduleEntry) =>
    shiftMap.get(entry.shiftId)?.type === 'work';

  for (const employee of employees) {
    if (!employee.isActive) continue;
    const empEntries = entries.filter((e) => e.employeeId === employee.id);
    if (empEntries.length === 0) continue;

    const inWindow = empEntries.filter(
      (e) => e.date >= window.from && e.date <= window.to
    );

    // ---- Heures hebdomadaires, semaine par semaine ----
    // On repart du lundi de chaque semaine touchée par la plage, puis on
    // additionne TOUTES les entrées de cette semaine, même celles qui
    // tombent en dehors de la plage : sinon une semaine à cheval sur les
    // bornes paraîtrait plus courte qu'elle ne l'est.
    const weekStarts = new Set(inWindow.map((e) => mondayOf(e.date)));
    for (const weekStart of weekStarts) {
      const weekEnd = format(addDays(parseISO(weekStart), 6), 'yyyy-MM-dd');
      const weeklyHours = empEntries
        .filter((e) => e.date >= weekStart && e.date <= weekEnd)
        .reduce(
          (sum, e) => sum + getPlannedEntryDurationHours(e, shiftMap.get(e.shiftId)),
          0
        );

      const overLegal = legalWeeklyMax > 0 && weeklyHours > legalWeeklyMax;
      const overContract = employee.contractHours > 0 && weeklyHours > employee.contractHours;

      if (overLegal || overContract) {
        alerts.push({
          id: `alert-overtime-${employee.id}-${weekStart}`,
          type: 'overtime',
          severity: overLegal ? 'error' : 'warning',
          message: overLegal
            ? `${employee.firstName} ${employee.lastName} : ${formatHours(weeklyHours)} planifiées sur la semaine du ${formatDate(weekStart)} — au-delà du plafond légal de ${legalWeeklyMax} h`
            : `${employee.firstName} ${employee.lastName} : ${formatHours(weeklyHours)} planifiées sur la semaine du ${formatDate(weekStart)} — au-delà de son contrat de ${employee.contractHours} h`,
          employeeId: employee.id,
          date: weekStart,
          resolved: false,
        });
      }
    }

    // ---- Jour habituellement non disponible ----
    for (const entry of inWindow) {
      if (!isWorkEntry(entry)) continue;
      const dayName = DAY_NAMES[parseISO(entry.date).getDay()];
      if (!dayName) continue;
      if (employee.availability.includes(dayName as never)) continue;

      alerts.push({
        id: `alert-unavailable-${employee.id}-${entry.date}`,
        type: 'unavailable',
        severity: 'warning',
        message: `${employee.firstName} ${employee.lastName} est planifié(e) le ${formatDate(entry.date)} mais n'est pas disponible ce jour`,
        employeeId: employee.id,
        date: entry.date,
        resolved: false,
      });
    }

    // ---- Repos entre deux services ----
    const workEntries = empEntries
      .filter(isWorkEntry)
      .map((entry) => {
        const shift = shiftMap.get(entry.shiftId);
        const { start, end } = getEntryDisplayTimeRange(entry, shift);
        return {
          entry,
          startAt: getShiftStartDateTime(entry.date, start),
          endAt: getShiftEndDateTime(entry.date, start, end),
        };
      })
      .sort((a, b) => a.startAt.getTime() - b.startAt.getTime());

    for (let i = 0; i < workEntries.length - 1; i += 1) {
      const current = workEntries[i]!;
      const next = workEntries[i + 1]!;
      // On n'alerte que si le service suivant est dans la plage surveillée.
      if (next.entry.date < window.from || next.entry.date > window.to) continue;

      const restHours = differenceInMinutes(next.startAt, current.endAt) / 60;
      if (restHours >= minRestHours) continue;

      alerts.push({
        id: `alert-rest-${employee.id}-${next.entry.date}`,
        type: 'rest',
        severity: 'warning',
        message: `${employee.firstName} ${employee.lastName} n'a que ${formatHours(Math.max(restHours, 0))} de repos entre le ${formatDate(current.entry.date)} et le ${formatDate(next.entry.date)} (minimum ${minRestHours} h)`,
        employeeId: employee.id,
        date: next.entry.date,
        resolved: false,
      });
    }
  }

  return alerts;
}

/**
 * Journées validées dont la pause enregistrée est en dessous du minimum
 * légal. Les journées sans pause renseignée (validations antérieures à la
 * mise en place des minutes) sont ignorées : on ne devine pas.
 */
export function detectShortBreakAlerts(
  entries: ScheduleEntry[],
  employees: Employee[],
  window: AlertWindow
): PlanningAlert[] {
  const empMap = new Map(employees.map((e) => [e.id, e]));
  const alerts: PlanningAlert[] = [];

  for (const entry of entries) {
    if (entry.date < window.from || entry.date > window.to) continue;
    if (entry.validatedBreakMinutes == null) continue;

    const grossHours = getValidatedEntryGrossHours(entry);
    if (grossHours === 0) continue;
    if (!isBreakBelowLegal(grossHours, entry.validatedBreakMinutes)) continue;

    const employee = empMap.get(entry.employeeId);
    if (!employee || !employee.isActive) continue;

    alerts.push({
      id: `alert-shortbreak-${entry.employeeId}-${entry.date}`,
      type: 'short_break',
      severity: 'warning',
      message: `${employee.firstName} ${employee.lastName} : ${formatHours(grossHours)} travaillées le ${formatDate(entry.date)} avec seulement ${entry.validatedBreakMinutes} min de pause (minimum légal ${legalBreakMinutes(grossHours)} min)`,
      employeeId: entry.employeeId,
      date: entry.date,
      resolved: false,
    });
  }

  return alerts;
}

/** Retire les alertes dont la catégorie est désactivée dans les réglages. */
export function filterAlertsByNotifications(
  alerts: PlanningAlert[],
  notifications: NotificationSettings | undefined
): PlanningAlert[] {
  if (!notifications) return alerts;

  const enabled: Record<PlanningAlert['type'], boolean> = {
    overtime: notifications.overtime !== false,
    unavailable: notifications.unavailable !== false,
    validated_unavailable: notifications.unavailable !== false,
    rest: notifications.lowRest !== false,
    geofence_clock_in: notifications.geofencePunch !== false,
    geofence_clock_out: notifications.geofencePunch !== false,
    missing_punch: notifications.missingPunch !== false,
    short_break: notifications.shortBreak !== false,
    // Catégories sans réglage dédié : toujours affichées.
    conflict: true,
    understaffed: true,
  };

  return alerts.filter((a) => enabled[a.type] !== false);
}

/**
 * Shift de travail un jour marqué « indisponible » dans availability_requests,
 * alors que l’employé a validé le mois (availability_validations).
 * Parcourt toutes les entrées planning (pas seulement la semaine courante).
 */
export function detectValidatedAvailabilityConflicts(
  entries: ScheduleEntry[],
  employees: Employee[],
  shifts: Shift[],
  requests: { employeeId: string; date: string; status: string }[],
  validations: { employeeId: string; monthKey: string }[]
): PlanningAlert[] {
  const shiftMap = new Map(shifts.map((s) => [s.id, s]));
  const empMap = new Map(employees.map((e) => [e.id, e]));

  const validatedMonth = new Set(
    validations.map((v) => `${v.employeeId}|${v.monthKey}`)
  );
  const blockedDay = new Map<string, 'unavailable' | 'vacation'>();
  for (const r of requests) {
    if (r.status === 'unavailable' || r.status === 'vacation' || r.status === 'preferred') {
      blockedDay.set(
        `${r.employeeId}|${r.date}`,
        r.status === 'preferred' ? 'vacation' : (r.status as 'unavailable' | 'vacation')
      );
    }
  }

  const alerts: PlanningAlert[] = [];
  const seenEmpDate = new Set<string>();

  for (const entry of entries) {
    const shift = shiftMap.get(entry.shiftId);
    if (!shift || shift.type !== 'work') continue;

    const monthKey = format(parseISO(entry.date), 'yyyy-MM');
    if (!validatedMonth.has(`${entry.employeeId}|${monthKey}`)) continue;
    const blockStatus = blockedDay.get(`${entry.employeeId}|${entry.date}`);
    if (!blockStatus) continue;

    const dedupeKey = `${entry.employeeId}|${entry.date}`;
    if (seenEmpDate.has(dedupeKey)) continue;
    seenEmpDate.add(dedupeKey);

    const employee = empMap.get(entry.employeeId);
    if (!employee) continue;

    const reasonLabel =
      blockStatus === 'vacation' ? 'être en vacances' : 'être indisponible';

    alerts.push({
      id: `alert-unavail-validated-${entry.employeeId}-${entry.date}`,
      type: 'validated_unavailable',
      severity: 'error',
      message: `${employee.firstName} ${employee.lastName} est planifié(e) le ${formatDate(entry.date)} alors qu'il/elle a indiqué ${reasonLabel} et a validé ses disponibilités pour ce mois.`,
      employeeId: entry.employeeId,
      date: entry.date,
      resolved: false,
    });
  }

  return alerts;
}

export type AvailabilityRequestRow = { employeeId: string; date: string; status: string };
export type AvailabilityValidationRow = { employeeId: string; monthKey: string };

/** Applique le statut résolu aux alertes dont l’ID est en base. */
export function applyResolvedPlanningAlerts(
  alerts: PlanningAlert[],
  resolvedIds: string[]
): PlanningAlert[] {
  if (resolvedIds.length === 0) return alerts;
  const resolvedSet = new Set(resolvedIds);
  return alerts.map((a) =>
    resolvedSet.has(a.id) ? { ...a, resolved: true } : a
  );
}

/** Jours passés surveillés par les alertes (pointages manquants, pauses trop courtes). */
export const ALERT_WINDOW_PAST_DAYS = 21;
/** Jours à venir surveillés par les alertes (planning déjà saisi). */
export const ALERT_WINDOW_FUTURE_DAYS = 60;

/** Plage surveillée par les alertes autour d’une date de référence. */
export function getAlertWindow(referenceDate: Date): AlertWindow {
  return {
    from: format(subDays(referenceDate, ALERT_WINDOW_PAST_DAYS), 'yyyy-MM-dd'),
    to: format(addDays(referenceDate, ALERT_WINDOW_FUTURE_DAYS), 'yyyy-MM-dd'),
  };
}

/** Alertes planning + conflits dispo / mois validé (charge initiale et refresh). */
export function buildPlanningAlerts(
  employees: Employee[],
  shifts: Shift[],
  scheduleEntries: ScheduleEntry[],
  window: AlertWindow,
  settings: AlertSettings,
  availabilityRequests: AvailabilityRequestRow[],
  availabilityValidations: AvailabilityValidationRow[]
): PlanningAlert[] {
  const schedule = detectScheduleAlerts(
    scheduleEntries,
    employees,
    shifts,
    window,
    settings
  );
  const shortBreaks = detectShortBreakAlerts(scheduleEntries, employees, window);
  const validated = detectValidatedAvailabilityConflicts(
    scheduleEntries,
    employees,
    shifts,
    availabilityRequests,
    availabilityValidations
  );
  return [...schedule, ...shortBreaks, ...validated];
}

/** Fenêtre minimale (± mois autour d’une date) pour ne pas manquer des dispos hors plage des entrées planning. */
const AVAILABILITY_PAD_MONTHS = 6;

/** Plage pour charger availability_requests : union (bornes des entrées ± fenêtre autour d’aujourd’hui). */
export function getAvailabilityFetchRange(
  scheduleEntries: ScheduleEntry[],
  referenceDate: Date
): { rangeFrom: string; rangeTo: string } {
  const padFrom = format(subMonths(referenceDate, AVAILABILITY_PAD_MONTHS), 'yyyy-MM-dd');
  const padTo = format(addMonths(referenceDate, AVAILABILITY_PAD_MONTHS), 'yyyy-MM-dd');

  const dates = scheduleEntries.map((e) => e.date).filter(Boolean);
  const sorted = [...dates].sort();
  if (sorted.length === 0) {
    return { rangeFrom: padFrom, rangeTo: padTo };
  }
  const entryMin = sorted[0]!;
  const entryMax = sorted[sorted.length - 1]!;
  return {
    rangeFrom: entryMin < padFrom ? entryMin : padFrom,
    rangeTo: entryMax > padTo ? entryMax : padTo,
  };
}

export function availabilityMapKey(employeeId: string, date: string): string {
  return `${employeeId}|${date}`;
}

/**
 * Remplace les statuts pour les jours dans [windowFrom, windowTo], puis applique les lignes serveur.
 * Permet de retirer une entrée supprimée côté employé lors d’un re-fetch de fenêtre.
 */
export function mergeAvailabilityWindowIntoMap(
  prev: Record<string, string>,
  windowFrom: string,
  windowTo: string,
  rows: AvailabilityRequestRow[]
): Record<string, string> {
  const next: Record<string, string> = { ...prev };
  for (const key of Object.keys(next)) {
    const parts = key.split('|');
    const datePart = parts.length >= 2 ? parts[parts.length - 1]! : '';
    if (datePart >= windowFrom && datePart <= windowTo) {
      delete next[key];
    }
  }
  for (const r of rows) {
    const status =
      r.status === 'vacation' || r.status === 'unavailable'
        ? r.status
        : r.status === 'preferred'
          ? 'vacation'
          : null;
    if (status) {
      next[availabilityMapKey(r.employeeId, r.date)] = status;
    }
  }
  return next;
}

// ---- POSITIONNEMENT POPUP ----
// Calcule la position x/y d'un picker pour qu'il reste toujours
// entièrement visible dans la fenêtre, quelle que soit la cellule cliquée.
export function calcPickerPosition(
  cellRect: DOMRect,
  pickerWidth = 256,
  pickerHeight = 420
): { x: number; y: number } {
  const MARGIN = 8;
  const HEADER_H = 72; // hauteur du header fixe + toolbar

  // Essaie d'abord en dessous de la cellule
  let y = cellRect.bottom + MARGIN;
  let x = cellRect.left + cellRect.width / 2 - pickerWidth / 2;

  // Si ça dépasse en bas → passe au-dessus
  if (y + pickerHeight > window.innerHeight - MARGIN) {
    y = cellRect.top - MARGIN - pickerHeight;
  }

  // Jamais au-dessus du header
  y = Math.max(HEADER_H, y);

  // Jamais en dessous du bas de l'écran
  y = Math.min(window.innerHeight - pickerHeight - MARGIN, y);

  // Jamais hors de l'écran à droite ou à gauche
  x = Math.min(window.innerWidth - pickerWidth - MARGIN, x);
  x = Math.max(MARGIN + 264, x); // 264 = largeur sidebar

  return { x, y };
}

// ---- COULEURS ----
export const EMPLOYEE_COLORS = [
  '#EF4444', // Rouge
  '#86EFAC', // Vert clair
  '#16A34A', // Vert foncé
  '#7DD3FC', // Bleu clair
  '#1D4ED8', // Bleu foncé
  '#7C3AED', // Violet
  '#F472B6', // Rose
  '#F97316', // Orange
  '#FACC15', // Jaune
  '#94A3B8', // Gris
  '#1E293B', // Noir
  '#92400E', // Brun
  '#D4B896', // Beige
  '#0D9488', // Sarcelle (teal)
  '#4F46E5', // Indigo
  '#DB2777', // Framboise
  '#0E7490', // Cyan foncé
];

export function getInitials(firstName: string, lastName: string): string {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
}

// ---- NOMS JOURS ----
export const DAY_NAMES_FR: Record<string, string> = {
  monday: 'Lundi',
  tuesday: 'Mardi',
  wednesday: 'Mercredi',
  thursday: 'Jeudi',
  friday: 'Vendredi',
  saturday: 'Samedi',
  sunday: 'Dimanche',
};

/** Les 4 types de contrat affichés dans l'app (Suisse). */
export const CONTRACT_TYPES: ContractType[] = ['fixed', 'hourly', 'intern', 'apprentice'];

export const CONTRACT_LABELS: Record<ContractType, string> = {
  fixed: 'Salarié fixe',
  hourly: 'À l\'heure',
  intern: 'Stagiaire',
  apprentice: 'Apprenti',
};

/** Anciennes valeurs (avant migration) — affichage seulement. */
const LEGACY_CONTRACT_LABELS: Record<string, string> = {
  'full-time': 'Salarié fixe',
  'part-time': 'Salarié fixe (temps partiel)',
  freelance: 'À l\'heure',
};

/** Libellé affiché sur les cartes employés, filtres, etc. */
export function getContractLabel(contractType: string): string {
  if (contractType in CONTRACT_LABELS) {
    return CONTRACT_LABELS[contractType as ContractType];
  }
  return LEGACY_CONTRACT_LABELS[contractType] ?? contractType;
}

/** Convertit les anciennes valeurs en base vers le modèle Suisse. */
export function normalizeContractType(raw: string | null | undefined): ContractType {
  const map: Record<string, ContractType> = {
    'full-time': 'fixed',
    'part-time': 'fixed',
    freelance: 'hourly',
    intern: 'intern',
    fixed: 'fixed',
    hourly: 'hourly',
    apprentice: 'apprentice',
  };
  if (raw && raw in map) return map[raw];
  return 'fixed';
}

/** Lien admin pour ouvrir le planning au bon endroit depuis une alerte. */
export function getPlanningAlertNavigationHref(alert: PlanningAlert): string | null {
  if (alert.type === 'geofence_clock_in' || alert.type === 'geofence_clock_out') {
    return '/pointages';
  }

  if (!alert.date) return null;

  const params = new URLSearchParams({ date: alert.date });
  if (alert.employeeId) params.set('employee', alert.employeeId);

  if (alert.type === 'overtime') {
    return `/planning/weekly?${params.toString()}`;
  }

  // Ces deux alertes concernent une journée déjà travaillée : c'est dans le
  // planning réel qu'on la corrige.
  if (alert.type === 'missing_punch' || alert.type === 'short_break') {
    return `/planning/real/monthly?${params.toString()}`;
  }

  return `/planning/monthly?${params.toString()}`;
}

export function canNavigateFromPlanningAlert(alert: PlanningAlert): boolean {
  return getPlanningAlertNavigationHref(alert) !== null;
}
