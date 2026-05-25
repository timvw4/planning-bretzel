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
} from 'date-fns';
import { fr } from 'date-fns/locale';
import { Employee, Shift, ScheduleEntry, PlanningAlert, DayColumn } from './types';

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

/** Durée (heures) pour une entrée : validée si renseignée, sinon durée du shift. */
export function getEntryDurationHours(entry: ScheduleEntry, shift: Shift | undefined): number {
  if (!shift) return 0;
  if (entry.validatedStart && entry.validatedEnd) {
    return calculateShiftDuration(entry.validatedStart, entry.validatedEnd);
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

/** Durée réelle validée ; 0 si le jour n’est pas validé. */
export function getValidatedEntryDurationHours(entry: ScheduleEntry): number {
  if (!entry.validatedStart || !entry.validatedEnd) return 0;
  return calculateShiftDuration(entry.validatedStart, entry.validatedEnd);
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

// ---- CALCUL DES HEURES PAR EMPLOYÉ ----
export function getEmployeeHoursForPeriod(
  employeeId: string,
  entries: ScheduleEntry[],
  shifts: Shift[],
  startDate: string,
  endDate: string
): number {
  const shiftMap = new Map(shifts.map((s) => [s.id, s]));

  return entries
    .filter(
      (e) =>
        e.employeeId === employeeId &&
        e.date >= startDate &&
        e.date <= endDate
    )
    .reduce((total, entry) => {
      const shift = shiftMap.get(entry.shiftId);
      return total + getEntryDurationHours(entry, shift);
    }, 0);
}

// ---- ALERTES PLANNING ----
export function detectAlerts(
  entries: ScheduleEntry[],
  employees: Employee[],
  shifts: Shift[],
  weekStart: string,
  weekEnd: string
): PlanningAlert[] {
  const alerts: PlanningAlert[] = [];
  const shiftMap = new Map(shifts.map((s) => [s.id, s]));
  const empMap = new Map(employees.map((e) => [e.id, e]));

  // Grouper les entrées par employé
  const entriesByEmp = new Map<string, ScheduleEntry[]>();
  entries
    .filter((e) => e.date >= weekStart && e.date <= weekEnd)
    .forEach((entry) => {
      const list = entriesByEmp.get(entry.employeeId) || [];
      list.push(entry);
      entriesByEmp.set(entry.employeeId, list);
    });

  entriesByEmp.forEach((empEntries, empId) => {
    const employee = empMap.get(empId);
    if (!employee) return;

    // Calcul heures semaine (utilise les heures validées si présentes)
    const weeklyHours = empEntries.reduce((sum, e) => {
      const shift = shiftMap.get(e.shiftId);
      return sum + getEntryDurationHours(e, shift);
    }, 0);

    if (weeklyHours > 48) {
      alerts.push({
        id: `alert-overtime-${empId}-${weekStart}`,
        type: 'overtime',
        severity: 'error',
        message: `${employee.firstName} ${employee.lastName} a ${weeklyHours}h planifiées cette semaine (max 48h)`,
        employeeId: empId,
        date: weekStart,
        resolved: false,
      });
    }

    // Vérifier disponibilité
    const dayNames: Record<number, string> = {
      0: 'sunday', 1: 'monday', 2: 'tuesday', 3: 'wednesday',
      4: 'thursday', 5: 'friday', 6: 'saturday',
    };

    empEntries.forEach((entry) => {
      const date = parseISO(entry.date);
      const dayName = dayNames[date.getDay()] as string;
      const shift = shiftMap.get(entry.shiftId);

      if (shift && shift.type === 'work' && !employee.availability.includes(dayName as any)) {
        alerts.push({
          id: `alert-unavailable-${empId}-${entry.date}`,
          type: 'unavailable',
          severity: 'warning',
          message: `${employee.firstName} ${employee.lastName} est planifié(e) le ${formatDate(entry.date)} mais n'est pas disponible ce jour`,
          employeeId: empId,
          date: entry.date,
          resolved: false,
        });
      }
    });

    // Vérifier repos entre shifts consécutifs
    const sortedEntries = [...empEntries].sort((a, b) => a.date.localeCompare(b.date));
    for (let i = 0; i < sortedEntries.length - 1; i++) {
      const curr = sortedEntries[i];
      const next = sortedEntries[i + 1];
      const currShift = shiftMap.get(curr.shiftId);
      const nextShift = shiftMap.get(next.shiftId);

      if (currShift?.type === 'work' && nextShift?.type === 'work') {
        const currEnd = currShift.endTime === '00:00' ? '24:00' : currShift.endTime;
        const restHours = 24 - parseInt(currEnd.split(':')[0]) + parseInt(nextShift.startTime.split(':')[0]);
        if (restHours < 11) {
          alerts.push({
            id: `alert-rest-${empId}-${next.date}`,
            type: 'rest',
            severity: 'warning',
            message: `${employee.firstName} ${employee.lastName} a moins de 11h de repos entre le ${formatDate(curr.date)} et le ${formatDate(next.date)}`,
            employeeId: empId,
            date: next.date,
            resolved: false,
          });
        }
      }
    }
  });

  return alerts;
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
  const unavailableDay = new Set(
    requests
      .filter((r) => r.status === 'unavailable')
      .map((r) => `${r.employeeId}|${r.date}`)
  );

  const alerts: PlanningAlert[] = [];
  const seenEmpDate = new Set<string>();

  for (const entry of entries) {
    const shift = shiftMap.get(entry.shiftId);
    if (!shift || shift.type !== 'work') continue;

    const monthKey = format(parseISO(entry.date), 'yyyy-MM');
    if (!validatedMonth.has(`${entry.employeeId}|${monthKey}`)) continue;
    if (!unavailableDay.has(`${entry.employeeId}|${entry.date}`)) continue;

    const dedupeKey = `${entry.employeeId}|${entry.date}`;
    if (seenEmpDate.has(dedupeKey)) continue;
    seenEmpDate.add(dedupeKey);

    const employee = empMap.get(entry.employeeId);
    if (!employee) continue;

    alerts.push({
      id: `alert-unavail-validated-${entry.employeeId}-${entry.date}`,
      type: 'validated_unavailable',
      severity: 'error',
      message: `${employee.firstName} ${employee.lastName} est planifié(e) le ${formatDate(entry.date)} alors qu'il/elle a indiqué être indisponible et a validé ses disponibilités pour ce mois.`,
      employeeId: entry.employeeId,
      date: entry.date,
      resolved: false,
    });
  }

  return alerts;
}

export type AvailabilityRequestRow = { employeeId: string; date: string; status: string };
export type AvailabilityValidationRow = { employeeId: string; monthKey: string };

/** Alertes hebdo + conflits dispo / mois validé (charge initiale et refresh). */
export function buildPlanningAlerts(
  employees: Employee[],
  shifts: Shift[],
  scheduleEntries: ScheduleEntry[],
  weekStart: string,
  weekEnd: string,
  availabilityRequests: AvailabilityRequestRow[],
  availabilityValidations: AvailabilityValidationRow[]
): PlanningAlert[] {
  const weekly = detectAlerts(scheduleEntries, employees, shifts, weekStart, weekEnd);
  const validated = detectValidatedAvailabilityConflicts(
    scheduleEntries,
    employees,
    shifts,
    availabilityRequests,
    availabilityValidations
  );
  return [...weekly, ...validated];
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
    next[availabilityMapKey(r.employeeId, r.date)] = r.status;
  }
  return next;
}

/** Représentation admin (planning) alignée sur les statuts employé : available / preferred / unavailable. */
export function availabilityStatusDisplay(
  status: string | undefined | null
): { symbol: string; title: string; className: string } | null {
  if (!status) return null;
  switch (status) {
    case 'available':
      return {
        symbol: '✓',
        title: 'Disponibilité : Disponible',
        className: 'text-emerald-600',
      };
    case 'preferred':
      return {
        symbol: '★',
        title: 'Disponibilité : Préféré',
        className: 'text-amber-700',
      };
    case 'unavailable':
      return {
        symbol: '✗',
        title: 'Disponibilité : Indisponible',
        className: 'text-red-600',
      };
    default:
      return null;
  }
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

export const CONTRACT_LABELS: Record<string, string> = {
  'full-time': 'CDI Temps plein',
  'part-time': 'CDI Temps partiel',
  'freelance': 'Freelance',
  'intern': 'Stagiaire',
};
