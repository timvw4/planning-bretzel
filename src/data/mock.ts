// ============================================================
// DONNÉES MOCK RÉALISTES — Planning Bretzel
// ============================================================

import { Employee, Shift, ScheduleEntry, AppSettings } from '@/lib/types';
import { SWISS_DEFAULT_MAX_WEEKLY_HOURS, SWISS_MIN_REST_HOURS } from '@/lib/swissLabor';
import { format, addDays, startOfMonth, getDay } from 'date-fns';

// ---- SHIFTS PRÉDÉFINIS ----
export const mockShifts: Shift[] = [
  {
    id: 'shift-matin',
    name: 'Matin',
    shortName: 'MAT',
    type: 'work',
    startTime: '08:00',
    endTime: '16:00',
    color: '#DBEAFE',
    textColor: '#1D4ED8',
    durationHours: 8,
    description: 'Service du matin',
    isActive: true,
  },
  {
    id: 'shift-soir',
    name: 'Soir',
    shortName: 'SOIR',
    type: 'work',
    startTime: '16:00',
    endTime: '00:00',
    color: '#EDE9FE',
    textColor: '#6D28D9',
    durationHours: 8,
    description: 'Service du soir',
    isActive: true,
  },
  {
    id: 'shift-journee',
    name: 'Journée',
    shortName: 'JOUR',
    type: 'work',
    startTime: '09:00',
    endTime: '17:00',
    color: '#DCFCE7',
    textColor: '#15803D',
    durationHours: 8,
    description: 'Horaires de journée standard',
    isActive: true,
  },
  {
    id: 'shift-courte',
    name: 'Demi-journée',
    shortName: '½J',
    type: 'work',
    startTime: '09:00',
    endTime: '13:00',
    color: '#FEF9C3',
    textColor: '#A16207',
    durationHours: 4,
    description: 'Demi-journée du matin',
    isActive: true,
  },
  {
    id: 'shift-nuit',
    name: 'Nuit',
    shortName: 'NUIT',
    type: 'work',
    startTime: '00:00',
    endTime: '08:00',
    color: '#1E293B',
    textColor: '#CBD5E1',
    durationHours: 8,
    description: 'Service de nuit',
    isActive: true,
  },
  {
    id: 'shift-off',
    name: 'Repos',
    shortName: 'OFF',
    type: 'off',
    startTime: '00:00',
    endTime: '00:00',
    color: '#F1F5F9',
    textColor: '#64748B',
    durationHours: 0,
    description: 'Jour de repos',
    isActive: true,
  },
  {
    id: 'shift-conge',
    name: 'Congé',
    shortName: 'CP',
    type: 'vacation',
    startTime: '00:00',
    endTime: '00:00',
    color: '#FEE2E2',
    textColor: '#DC2626',
    durationHours: 0,
    description: 'Congé payé',
    isActive: true,
  },
  {
    id: 'shift-maladie',
    name: 'Maladie',
    shortName: 'MAL',
    type: 'sick',
    startTime: '00:00',
    endTime: '00:00',
    color: '#FFE4E6',
    textColor: '#BE123C',
    durationHours: 0,
    description: 'Arrêt maladie',
    isActive: true,
  },
  {
    id: 'shift-formation',
    name: 'Formation',
    shortName: 'FOR',
    type: 'training',
    startTime: '09:00',
    endTime: '17:00',
    color: '#F0FDF4',
    textColor: '#166534',
    durationHours: 8,
    description: 'Jour de formation',
    isActive: true,
  },
];

// ---- EMPLOYÉS ----
export const mockEmployees: Employee[] = [
  {
    id: 'emp-01',
    firstName: 'Sophie',
    lastName: 'Martin',
    position: 'vente',
    email: 'sophie.martin@bretzel.fr',
    phone: '+33 6 12 34 56 78',
    color: '#6366F1',
    availability: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
    contractType: 'fixed',
    contractHours: 42,
    annualVacationDays: 25,
    notes: 'Référente équipe. Préfère les horaires du matin.',
    isActive: true,
    inactiveMonths: [],
    createdAt: '2023-01-15',
  },
  {
    id: 'emp-02',
    firstName: 'Lucas',
    lastName: 'Bernard',
    position: 'vente',
    email: 'lucas.bernard@bretzel.fr',
    phone: '+33 6 23 45 67 89',
    color: '#F59E0B',
    availability: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'],
    contractType: 'fixed',
    contractHours: 42,
    annualVacationDays: 25,
    notes: 'Disponible le samedi. Allergique aux arachides.',
    isActive: true,
    inactiveMonths: [],
    createdAt: '2023-03-10',
  },
  {
    id: 'emp-03',
    firstName: 'Emma',
    lastName: 'Dubois',
    position: 'vente',
    email: 'emma.dubois@bretzel.fr',
    phone: '+33 6 34 56 78 90',
    color: '#10B981',
    availability: ['wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
    contractType: 'fixed',
    contractHours: 24,
    annualVacationDays: 25,
    notes: 'Disponible uniquement en soirée les jours de semaine.',
    isActive: true,
    inactiveMonths: [],
    createdAt: '2023-05-20',
  },
  {
    id: 'emp-04',
    firstName: 'Antoine',
    lastName: 'Lefebvre',
    position: 'vente',
    email: 'antoine.lefebvre@bretzel.fr',
    phone: '+33 6 45 67 89 01',
    color: '#EC4899',
    availability: ['tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
    contractType: 'fixed',
    contractHours: 42,
    annualVacationDays: 25,
    notes: 'Maîtrise la mixologie. Formation cocktail en cours.',
    isActive: true,
    inactiveMonths: [],
    createdAt: '2023-02-01',
  },
  {
    id: 'emp-05',
    firstName: 'Chloé',
    lastName: 'Petit',
    position: 'cuisine',
    email: 'chloe.petit@bretzel.fr',
    phone: '+33 6 56 78 90 12',
    color: '#F97316',
    availability: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
    contractType: 'fixed',
    contractHours: 42,
    annualVacationDays: 25,
    notes: 'Spécialiste pâtisserie. Ne travaille pas le week-end.',
    isActive: true,
    inactiveMonths: [],
    createdAt: '2022-11-15',
  },
  {
    id: 'emp-06',
    firstName: 'Thomas',
    lastName: 'Moreau',
    position: 'cuisine',
    email: 'thomas.moreau@bretzel.fr',
    phone: '+33 6 67 89 01 23',
    color: '#06B6D4',
    availability: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'],
    contractType: 'fixed',
    contractHours: 20,
    annualVacationDays: 25,
    notes: 'Étudiant. Disponible surtout en soirée.',
    isActive: true,
    inactiveMonths: [],
    createdAt: '2024-01-08',
  },
  {
    id: 'emp-07',
    firstName: 'Laura',
    lastName: 'Simon',
    position: 'vente',
    email: 'laura.simon@bretzel.fr',
    phone: '+33 6 78 90 12 34',
    color: '#8B5CF6',
    availability: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
    contractType: 'fixed',
    contractHours: 42,
    annualVacationDays: 25,
    notes: 'Accès caisse principale. Référente administratif.',
    isActive: true,
    inactiveMonths: [],
    createdAt: '2022-08-22',
  },
  {
    id: 'emp-08',
    firstName: 'Maxime',
    lastName: 'Leroy',
    position: 'cuisine',
    email: 'maxime.leroy@bretzel.fr',
    phone: '+33 6 89 01 23 45',
    color: '#EF4444',
    availability: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
    contractType: 'fixed',
    contractHours: 42,
    annualVacationDays: 25,
    notes: 'Polyvalent. Disponible 7j/7.',
    isActive: true,
    inactiveMonths: [],
    createdAt: '2023-06-01',
  },
  {
    id: 'emp-09',
    firstName: 'Julie',
    lastName: 'Roux',
    position: 'vente',
    email: 'julie.roux@bretzel.fr',
    phone: '+33 6 90 12 34 56',
    color: '#14B8A6',
    availability: ['thursday', 'friday', 'saturday', 'sunday'],
    contractType: 'fixed',
    contractHours: 16,
    annualVacationDays: 25,
    notes: 'Travaille en extra le week-end.',
    isActive: true,
    inactiveMonths: [],
    createdAt: '2024-03-15',
  },
];

// ---- GÉNÉRATION DU PLANNING MOCK ----
function generateMockSchedule(): ScheduleEntry[] {
  const entries: ScheduleEntry[] = [];
  const today = new Date();
  const monthStart = startOfMonth(today);

  // Patterns de shifts par employé (pour simuler un vrai planning)
  const patterns: Record<string, string[]> = {
    'emp-01': ['shift-matin', 'shift-matin', 'shift-matin', 'shift-matin', 'shift-matin', 'shift-off', 'shift-off'],
    'emp-02': ['shift-soir', 'shift-soir', 'shift-off', 'shift-soir', 'shift-soir', 'shift-soir', 'shift-off'],
    'emp-03': ['shift-off', 'shift-off', 'shift-soir', 'shift-soir', 'shift-soir', 'shift-journee', 'shift-journee'],
    'emp-04': ['shift-off', 'shift-soir', 'shift-soir', 'shift-soir', 'shift-off', 'shift-soir', 'shift-soir'],
    'emp-05': ['shift-matin', 'shift-matin', 'shift-matin', 'shift-conge', 'shift-matin', 'shift-off', 'shift-off'],
    'emp-06': ['shift-off', 'shift-soir', 'shift-soir', 'shift-soir', 'shift-soir', 'shift-soir', 'shift-off'],
    'emp-07': ['shift-journee', 'shift-journee', 'shift-journee', 'shift-journee', 'shift-journee', 'shift-off', 'shift-off'],
    'emp-08': ['shift-matin', 'shift-off', 'shift-journee', 'shift-journee', 'shift-soir', 'shift-matin', 'shift-matin'],
    'emp-09': ['shift-off', 'shift-off', 'shift-off', 'shift-soir', 'shift-soir', 'shift-journee', 'shift-journee'],
  };

  // Générer sur 35 jours (mois complet + buffer)
  for (let dayOffset = -7; dayOffset <= 35; dayOffset++) {
    const date = addDays(monthStart, dayOffset);
    const dayOfWeek = getDay(date); // 0=dimanche, 1=lundi...
    const patternIndex = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Convertir en lundi=0

    mockEmployees.forEach((emp) => {
      const pattern = patterns[emp.id] || [];
      const shiftId = pattern[patternIndex] || 'shift-off';

      // Ajouter quelques variations pour rendre réaliste
      let finalShiftId = shiftId;
      const dateStr = format(date, 'yyyy-MM-dd');

      // Exceptions spécifiques pour simuler des congés, maladies, etc.
      if (emp.id === 'emp-05' && dateStr >= format(addDays(today, 2), 'yyyy-MM-dd') && dateStr <= format(addDays(today, 5), 'yyyy-MM-dd')) {
        finalShiftId = 'shift-conge';
      }
      if (emp.id === 'emp-06' && dateStr === format(today, 'yyyy-MM-dd')) {
        finalShiftId = 'shift-maladie';
      }

      entries.push({
        id: `entry-${emp.id}-${dateStr}`,
        employeeId: emp.id,
        shiftId: finalShiftId,
        date: dateStr,
        note: undefined,
        isModified: false,
        visibleToEmployee: true,
      });
    });
  }

  return entries;
}

export const mockScheduleEntries: ScheduleEntry[] = generateMockSchedule();

// ---- PARAMÈTRES PAR DÉFAUT ----
export const defaultSettings: AppSettings = {
  companyName: 'Bretzel & Co',
  weekStartDay: 1, // Lundi
  minRestHours: SWISS_MIN_REST_HOURS,
  maxWeeklyHours: SWISS_DEFAULT_MAX_WEEKLY_HOURS,
  locale: 'fr-CH',
  timezone: 'Europe/Zurich',
  theme: 'light',
  planningMonthMode: 'strict',
  deductBreaks: false,
  notifications: {
    overtime: true,
    unavailable: true,
    lowRest: true,
    geofencePunch: true,
    missingPunch: true,
    shortBreak: true,
  },
  workSite: null,
  holidays: [
    { date: '2026-01-01', name: 'Jour de l\'An' },
    { date: '2026-04-06', name: 'Lundi de Pâques' },
    { date: '2026-05-01', name: 'Fête du Travail' },
    { date: '2026-05-08', name: 'Victoire 1945' },
    { date: '2026-05-14', name: 'Ascension' },
    { date: '2026-05-25', name: 'Lundi de Pentecôte' },
    { date: '2026-07-14', name: 'Fête Nationale' },
    { date: '2026-08-15', name: 'Assomption' },
    { date: '2026-11-01', name: 'Toussaint' },
    { date: '2026-11-11', name: 'Armistice' },
    { date: '2026-12-25', name: 'Noël' },
  ],
};
