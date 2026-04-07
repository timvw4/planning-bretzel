// ============================================================
// TYPES TYPESCRIPT — Logiciel de planning Bretzel
// ============================================================

export type ContractType = 'full-time' | 'part-time' | 'freelance' | 'intern';
export type AvailabilityDay = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';

export interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  role: string;
  email: string;
  phone: string;
  color: string;           // Couleur hexadécimale attribuée dans le planning
  avatar?: string;
  availability: AvailabilityDay[];
  contractType: ContractType;
  contractHours: number;   // Heures contractuelles par semaine
  notes: string;
  isActive: boolean;
  inactiveMonths: string[];  // Clés 'yyyy-MM' des mois où l'employé est désactivé
  createdAt: string;
}

export type ShiftType = 'work' | 'off' | 'vacation' | 'sick' | 'holiday' | 'training';

export interface Shift {
  id: string;
  name: string;
  shortName: string;       // Abréviation ex: "MAT", "SOIR"
  type: ShiftType;
  startTime: string;       // Format "HH:MM"
  endTime: string;         // Format "HH:MM"
  color: string;           // Couleur d'affichage
  textColor: string;       // Couleur du texte
  durationHours: number;   // Calculé automatiquement
  description?: string;
  isActive: boolean;
}

export interface ScheduleEntry {
  id: string;
  employeeId: string;
  shiftId: string;
  date: string;            // Format ISO "YYYY-MM-DD"
  note?: string;
  isModified?: boolean;    // Marqué si modifié après publication
}

export type AlertSeverity = 'error' | 'warning' | 'info';

export interface PlanningAlert {
  id: string;
  type: 'overtime' | 'conflict' | 'unavailable' | 'rest' | 'understaffed';
  severity: AlertSeverity;
  message: string;
  employeeId?: string;
  date?: string;
  resolved: boolean;
}

export interface WeekSummary {
  employeeId: string;
  weekStart: string;
  totalHours: number;
  shiftCounts: Record<string, number>;
  alerts: PlanningAlert[];
}

export interface PublicHoliday {
  date: string;   // Format "YYYY-MM-DD"
  name: string;
}

export type PlanningMonthMode = 'strict' | 'full-weeks';

export interface AppSettings {
  companyName: string;
  companyLogo?: string;
  weekStartDay: 0 | 1;    // 0 = Dimanche, 1 = Lundi
  minRestHours: number;    // Heures minimales de repos entre shifts
  maxWeeklyHours: number;  // Maximum d'heures par semaine
  locale: string;
  timezone: string;
  theme: 'light' | 'dark' | 'system';
  holidays: PublicHoliday[];
  planningMonthMode: PlanningMonthMode; // 'strict' = 1er au dernier jour | 'full-weeks' = semaines complètes
}

// Types utilitaires pour l'UI
export interface EmployeeWithStats extends Employee {
  weeklyHours: number;
  monthlyHours: number;
  alerts: PlanningAlert[];
}

export interface DayColumn {
  date: string;
  dayName: string;
  dayNumber: number;
  isToday: boolean;
  isWeekend: boolean;
  isHoliday: boolean;
}

export interface PlanningCell {
  employeeId: string;
  date: string;
  entry?: ScheduleEntry;
  shift?: Shift;
  alerts: PlanningAlert[];
}
