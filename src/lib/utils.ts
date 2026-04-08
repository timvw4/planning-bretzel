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
      return total + (shift?.durationHours ?? 0);
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

    // Calcul heures semaine
    const weeklyHours = empEntries.reduce((sum, e) => {
      const shift = shiftMap.get(e.shiftId);
      return sum + (shift?.durationHours ?? 0);
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

/** Plage de dates pour charger availability_requests (bornes des entrées ou ±3 mois). */
export function getAvailabilityFetchRange(
  scheduleEntries: ScheduleEntry[],
  referenceDate: Date
): { rangeFrom: string; rangeTo: string } {
  const dates = scheduleEntries.map((e) => e.date).filter(Boolean);
  const sorted = [...dates].sort();
  return {
    rangeFrom:
      sorted.length > 0
        ? sorted[0]!
        : format(subMonths(referenceDate, 3), 'yyyy-MM-dd'),
    rangeTo:
      sorted.length > 0
        ? sorted[sorted.length - 1]!
        : format(addMonths(referenceDate, 3), 'yyyy-MM-dd'),
  };
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
