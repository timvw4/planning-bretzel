'use client';

import { useMemo, useState } from 'react';
import {
  Users,
  Clock,
  AlertTriangle,
  Calendar,
  CheckCircle2,
  ArrowRight,
  Activity,
  Briefcase,
  BarChart2,
} from 'lucide-react';
import {
  format,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isToday,
  parseISO,
} from 'date-fns';
import { fr } from 'date-fns/locale';
import Link from 'next/link';
import { Header } from '@/components/layout/Header';
import { usePlanningStore } from '@/lib/store';
import { useShallow } from 'zustand/react/shallow';
import { formatHours, getInitials, formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

// ---- Carte statistique ----
function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  color,
  trend,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
  color: string;
  trend?: { value: string; positive: boolean };
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}>
          <Icon className="w-5 h-5" />
        </div>
        {trend && (
          <span
            className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
              trend.positive ? 'text-emerald-700 bg-emerald-50' : 'text-red-600 bg-red-50'
            }`}
          >
            {trend.value}
          </span>
        )}
      </div>
      <div className="mt-4">
        <p className="text-2xl font-bold text-slate-900">{value}</p>
        <p className="text-sm font-medium text-slate-600 mt-0.5">{label}</p>
        {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
      </div>
    </div>
  );
}

// ---- Composant alerte ----
function AlertItem({ alert }: { alert: { id: string; message: string; severity: string; type: string } }) {
  const colors = {
    error: { bg: 'bg-red-50', border: 'border-red-100', text: 'text-red-700', icon: 'text-red-500' },
    warning: { bg: 'bg-amber-50', border: 'border-amber-100', text: 'text-amber-700', icon: 'text-amber-500' },
    info: { bg: 'bg-blue-50', border: 'border-blue-100', text: 'text-blue-700', icon: 'text-blue-500' },
  };
  const c = colors[alert.severity as keyof typeof colors] || colors.info;

  return (
    <div className={`flex items-start gap-3 rounded-xl border p-3 ${c.bg} ${c.border}`}>
      <AlertTriangle className={`h-4 w-4 mt-0.5 shrink-0 ${c.icon}`} />
      <p className={`text-xs font-medium leading-relaxed ${c.text}`}>{alert.message}</p>
    </div>
  );
}

// ---- Bouton switch Semaine / Mois ----
function ViewToggle({
  view,
  onChange,
}: {
  view: 'week' | 'month';
  onChange: (v: 'week' | 'month') => void;
}) {
  return (
    <div className="flex items-center bg-slate-100 rounded-lg p-0.5 gap-0.5">
      <button
        onClick={() => onChange('week')}
        className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
          view === 'week'
            ? 'bg-white text-indigo-600 shadow-sm'
            : 'text-slate-500 hover:text-slate-700'
        }`}
      >
        Semaine
      </button>
      <button
        onClick={() => onChange('month')}
        className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
          view === 'month'
            ? 'bg-white text-indigo-600 shadow-sm'
            : 'text-slate-500 hover:text-slate-700'
        }`}
      >
        Mois
      </button>
    </div>
  );
}

export default function DashboardPage() {
  // Vue active : 'week' (semaine) ou 'month' (mois)
  const [view, setView] = useState<'week' | 'month'>('week');

  const {
    employees,
    shifts,
    scheduleEntries,
    alerts,
    getWeeklyHours,
    getMonthlyHours,
  } = usePlanningStore(
    useShallow((s) => ({
      employees: s.employees,
      shifts: s.shifts,
      scheduleEntries: s.scheduleEntries,
      alerts: s.alerts,
      getWeeklyHours: s.getWeeklyHours,
      getMonthlyHours: s.getMonthlyHours,
    }))
  );

  const today = new Date();
  const weekStart = format(startOfWeek(today, { weekStartsOn: 1 }), 'yyyy-MM-dd');
  const weekEnd = format(endOfWeek(today, { weekStartsOn: 1 }), 'yyyy-MM-dd');
  const monthStart = format(startOfMonth(today), 'yyyy-MM-dd');
  const monthEnd = format(endOfMonth(today), 'yyyy-MM-dd');

  const activeAlerts = alerts.filter((a) => !a.resolved);

  // Clé du mois courant au format 'yyyy-MM' (ex: '2026-04')
  const monthKey = format(today, 'yyyy-MM');
  // Clé du mois de début de semaine (une semaine peut chevaucher deux mois)
  const weekMonthKey = format(parseISO(weekStart), 'yyyy-MM');

  // Statistiques globales (semaine + mois)
  const stats = useMemo(() => {
    // Employés actifs CETTE semaine : actifs globalement ET pas dans inactiveMonths pour le mois de la semaine
    const activeEmployees = employees.filter(
      (e) => e.isActive && !(e.inactiveMonths ?? []).includes(weekMonthKey)
    );
    // Employés actifs CE mois : actifs globalement ET pas dans inactiveMonths pour ce mois
    const activeEmployeesThisMonth = employees.filter(
      (e) => e.isActive && !(e.inactiveMonths ?? []).includes(monthKey)
    );
    const shiftMap = new Map(shifts.map((s) => [s.id, s]));

    const weekEntries = scheduleEntries.filter((e) => e.date >= weekStart && e.date <= weekEnd);
    const weeklyTotal = weekEntries.reduce((sum, entry) => {
      const shift = shiftMap.get(entry.shiftId);
      return sum + (shift?.durationHours ?? 0);
    }, 0);

    const absenceShiftIds = shifts.filter((s) => ['vacation', 'sick'].includes(s.type)).map((s) => s.id);
    const weekAbsences = weekEntries.filter((e) => absenceShiftIds.includes(e.shiftId)).length;

    const monthEntries = scheduleEntries.filter((e) => e.date >= monthStart && e.date <= monthEnd);
    const monthTotal = monthEntries.reduce((sum, entry) => {
      const shift = shiftMap.get(entry.shiftId);
      return sum + (shift?.durationHours ?? 0);
    }, 0);

    // Jours planifiés ce mois (entrées de type 'work' uniquement)
    const workShiftIds = shifts.filter((s) => s.type === 'work').map((s) => s.id);
    const monthWorkedDays = monthEntries.filter((e) => workShiftIds.includes(e.shiftId)).length;

    // Absences ce mois
    const monthAbsences = monthEntries.filter((e) => absenceShiftIds.includes(e.shiftId)).length;

    return { activeEmployees, activeEmployeesThisMonth, weeklyTotal, weekAbsences, monthTotal, monthWorkedDays, monthAbsences };
  }, [employees, shifts, scheduleEntries, weekStart, weekEnd, monthStart, monthEnd, monthKey, weekMonthKey]);

  // Jours de la semaine en cours
  const weekDays = eachDayOfInterval({
    start: parseISO(weekStart),
    end: parseISO(weekEnd),
  });

  // Distribution des shifts — semaine
  const weekShiftDistribution = useMemo(() => {
    const shiftMap = new Map(shifts.map((s) => [s.id, s]));
    const weekEntries = scheduleEntries.filter((e) => e.date >= weekStart && e.date <= weekEnd);
    const counts: Record<string, { count: number; shift: (typeof shifts)[0] }> = {};
    weekEntries.forEach((entry) => {
      const shift = shiftMap.get(entry.shiftId);
      if (shift && shift.type === 'work') {
        if (!counts[entry.shiftId]) counts[entry.shiftId] = { count: 0, shift };
        counts[entry.shiftId].count++;
      }
    });
    return Object.values(counts).sort((a, b) => b.count - a.count);
  }, [shifts, scheduleEntries, weekStart, weekEnd]);

  // Distribution des shifts — mois
  const monthShiftDistribution = useMemo(() => {
    const shiftMap = new Map(shifts.map((s) => [s.id, s]));
    const monthEntries = scheduleEntries.filter((e) => e.date >= monthStart && e.date <= monthEnd);
    const counts: Record<string, { count: number; shift: (typeof shifts)[0] }> = {};
    monthEntries.forEach((entry) => {
      const shift = shiftMap.get(entry.shiftId);
      if (shift && shift.type === 'work') {
        if (!counts[entry.shiftId]) counts[entry.shiftId] = { count: 0, shift };
        counts[entry.shiftId].count++;
      }
    });
    return Object.values(counts).sort((a, b) => b.count - a.count);
  }, [shifts, scheduleEntries, monthStart, monthEnd]);

  // Résumé employés — semaine (uniquement ceux actifs CETTE semaine)
  const employeeWeeklySummary = useMemo(() => {
    return employees
      .filter((e) => e.isActive && !(e.inactiveMonths ?? []).includes(weekMonthKey))
      .map((e) => {
        const hours = getWeeklyHours(e.id, weekStart, weekEnd);
        const shiftMap = new Map(shifts.map((s) => [s.id, s]));
        const todayEntry = scheduleEntries.find(
          (se) => se.employeeId === e.id && se.date === format(today, 'yyyy-MM-dd')
        );
        const todayShift = todayEntry ? shiftMap.get(todayEntry.shiftId) : null;
        return { employee: e, weeklyHours: hours, todayShift };
      })
      .sort((a, b) => b.weeklyHours - a.weeklyHours);
  }, [employees, getWeeklyHours, weekStart, weekEnd, scheduleEntries, shifts, today, weekMonthKey]);

  // Résumé employés — mois (uniquement ceux actifs CE mois)
  const employeeMonthlySummary = useMemo(() => {
    return employees
      .filter((e) => e.isActive && !(e.inactiveMonths ?? []).includes(monthKey))
      .map((e) => {
        const hours = getMonthlyHours(e.id, monthStart, monthEnd);
        // Heures contractuelles mensuelles ≈ contrat hebdo × 4.33
        const contractMonthly = e.contractHours * 4.33;
        const ratio = contractMonthly > 0 ? Math.min(hours / contractMonthly, 1) : 0;
        return { employee: e, monthlyHours: hours, contractMonthly, ratio };
      })
      .sort((a, b) => b.monthlyHours - a.monthlyHours);
  }, [employees, getMonthlyHours, monthStart, monthEnd, monthKey]);

  // Libellé du sous-titre selon la vue
  const subtitle =
    view === 'week'
      ? `Semaine du ${formatDate(weekStart)} au ${formatDate(weekEnd)}`
      : `Mois de ${format(today, 'MMMM yyyy', { locale: fr })}`;

  // Lien "Voir le planning" selon la vue
  const planningHref = view === 'week' ? '/planning/weekly' : '/planning/monthly';

  return (
    <div className="animate-fade-in">
      <Header
        title="Dashboard"
        subtitle={subtitle}
        actions={
          <div className="flex items-center gap-2">
            <ViewToggle view={view} onChange={setView} />
            <Link href={planningHref}>
              <Button size="sm">
                <Calendar className="h-4 w-4" />
                Voir le planning
              </Button>
            </Link>
          </div>
        }
      />

      <div className="p-6 space-y-6">
        {/* ==================== VUE SEMAINE ==================== */}
        {view === 'week' && (
          <>
            {/* Statistiques semaine */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                icon={Users}
                label="Employés actifs cette semaine"
                value={stats.activeEmployees.length}
                sub={`${employees.length} employés au total`}
                color="bg-indigo-50 text-indigo-600"
              />
              <StatCard
                icon={Clock}
                label="Heures cette semaine"
                value={formatHours(stats.weeklyTotal)}
                sub={`${formatHours(stats.weeklyTotal / (stats.activeEmployees.length || 1))} moy. / employé`}
                color="bg-emerald-50 text-emerald-600"
              />
              <StatCard
                icon={Activity}
                label="Absences semaine"
                value={stats.weekAbsences}
                sub="Congés + arrêts"
                color="bg-amber-50 text-amber-600"
                trend={stats.weekAbsences > 3 ? { value: 'Élevé', positive: false } : undefined}
              />
              <StatCard
                icon={AlertTriangle}
                label="Alertes actives"
                value={activeAlerts.length}
                sub={activeAlerts.length === 0 ? 'Aucun problème' : 'À traiter'}
                color={activeAlerts.length > 0 ? 'bg-red-50 text-red-600' : 'bg-slate-50 text-slate-500'}
                trend={activeAlerts.length > 0 ? { value: 'Attention', positive: false } : undefined}
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Mini-planning semaine */}
              <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                  <div>
                    <h2 className="text-sm font-semibold text-slate-900">Planning de la semaine</h2>
                    <p className="text-xs text-slate-500 mt-0.5">Aperçu rapide des assignations</p>
                  </div>
                  <Link
                    href="/planning/weekly"
                    className="flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-700"
                  >
                    Détail complet <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-100">
                        <th className="text-left px-4 py-2.5 text-slate-700 font-semibold w-32 bg-slate-50">Employé</th>
                        {weekDays.map((day) => (
                          <th
                            key={day.toISOString()}
                            className={`text-center px-1 py-2.5 font-medium min-w-[52px] ${
                              isToday(day) ? 'text-indigo-600' : 'text-slate-500'
                            }`}
                          >
                            <div>{format(day, 'EEE', { locale: fr })}</div>
                            <div
                              className={`text-base font-bold mt-0.5 ${
                                isToday(day)
                                  ? 'w-7 h-7 bg-indigo-600 text-white rounded-full flex items-center justify-center mx-auto'
                                  : 'text-slate-800'
                              }`}
                            >
                              {format(day, 'd')}
                            </div>
                          </th>
                        ))}
                        <th className="text-center px-3 py-2.5 text-slate-500 font-medium">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {employeeWeeklySummary.map(({ employee, weeklyHours }) => {
                        const shiftMap = new Map(shifts.map((s) => [s.id, s]));
                        return (
                          <tr key={employee.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-4 py-2.5 bg-slate-50">
                          <div className="flex items-center gap-2">
                            <div
                              className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                              style={{ backgroundColor: employee.color }}
                            >
                              {getInitials(employee.firstName, employee.lastName)}
                            </div>
                            <span className="font-semibold text-slate-900 truncate max-w-[80px]">
                              {employee.firstName}
                            </span>
                          </div>
                        </td>
                            {weekDays.map((day) => {
                              const dateStr = format(day, 'yyyy-MM-dd');
                              const entry = scheduleEntries.find(
                                (e) => e.employeeId === employee.id && e.date === dateStr
                              );
                              const shift = entry ? shiftMap.get(entry.shiftId) : null;
                              return (
                                <td key={dateStr} className="px-1 py-2 text-center">
                                  {shift ? (
                                    <span
                                      className="inline-flex items-center justify-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold min-w-[36px]"
                                      style={{ backgroundColor: shift.color, color: shift.textColor }}
                                    >
                                      {shift.shortName}
                                    </span>
                                  ) : (
                                    <span className="text-slate-300">—</span>
                                  )}
                                </td>
                              );
                            })}
                            <td className="px-3 py-2.5 text-center">
                              <span
                                className={`text-xs font-semibold ${
                                  weeklyHours > employee.contractHours
                                    ? 'text-red-600'
                                    : weeklyHours === 0
                                    ? 'text-slate-300'
                                    : 'text-slate-700'
                                }`}
                              >
                                {formatHours(weeklyHours)}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Colonne droite — semaine */}
              <WeekSidebar
                activeAlerts={activeAlerts}
                shiftDistribution={weekShiftDistribution}
              />
            </div>
          </>
        )}

        {/* ==================== VUE MOIS ==================== */}
        {view === 'month' && (
          <>
            {/* Statistiques mois */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                icon={Users}
                label="Employés actifs ce mois"
                value={stats.activeEmployeesThisMonth.length}
                sub={`${stats.activeEmployees.length} actifs au total`}
                color="bg-indigo-50 text-indigo-600"
              />
              <StatCard
                icon={Clock}
                label="Heures ce mois"
                value={formatHours(stats.monthTotal)}
                sub={`${formatHours(stats.monthTotal / (stats.activeEmployeesThisMonth.length || 1))} moy. / employé`}
                color="bg-emerald-50 text-emerald-600"
              />
              <StatCard
                icon={BarChart2}
                label="Jours travaillés"
                value={stats.monthWorkedDays}
                sub="Toutes assignations de travail"
                color="bg-violet-50 text-violet-600"
              />
              <StatCard
                icon={Activity}
                label="Absences ce mois"
                value={stats.monthAbsences}
                sub="Congés + Arrêts"
                color="bg-amber-50 text-amber-600"
                trend={stats.monthAbsences > 10 ? { value: 'Élevé', positive: false } : undefined}
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Tableau récapitulatif mensuel */}
              <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                  <div>
                    <h2 className="text-sm font-semibold text-slate-900">Récapitulatif mensuel</h2>
                    <p className="text-xs text-slate-500 mt-0.5">Heures planifiées vs contrat</p>
                  </div>
                  <Link
                    href="/planning/monthly"
                    className="flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-700"
                  >
                    Détail complet <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
                <div className="divide-y divide-slate-50">
                  {employeeMonthlySummary.map(({ employee, monthlyHours, contractMonthly, ratio }) => {
                    const isOver = monthlyHours > contractMonthly;
                    const barColor = isOver ? '#ef4444' : '#6366f1';
                    return (
                      <div key={employee.id} className="px-5 py-3 hover:bg-slate-50/50 transition-colors">
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2">
                            <div
                              className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                              style={{ backgroundColor: employee.color }}
                            >
                              {getInitials(employee.firstName, employee.lastName)}
                            </div>
                            <span className="text-sm font-medium text-slate-800">
                              {employee.firstName} {employee.lastName}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span
                              className={`text-xs font-semibold ${
                                isOver ? 'text-red-600' : monthlyHours === 0 ? 'text-slate-300' : 'text-slate-700'
                              }`}
                            >
                              {formatHours(monthlyHours)}
                            </span>
                            <span className="text-xs text-slate-400">
                              / {formatHours(contractMonthly)}
                            </span>
                          </div>
                        </div>
                        {/* Barre de progression */}
                        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{ width: `${ratio * 100}%`, backgroundColor: barColor }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Colonne droite — mois */}
              <MonthSidebar
                activeAlerts={activeAlerts}
                shiftDistribution={monthShiftDistribution}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ---- Colonne droite partagée — Semaine ----
function WeekSidebar({
  activeAlerts,
  shiftDistribution,
}: {
  activeAlerts: { id: string; message: string; severity: string; type: string; resolved: boolean }[];
  shiftDistribution: { count: number; shift: { id: string; shortName: string; name: string; color: string; textColor: string } }[];
}) {
  return (
    <div className="space-y-4">
      <AlertsCard activeAlerts={activeAlerts} />
      <ShiftDistributionCard shiftDistribution={shiftDistribution} label="Shifts cette semaine" />
      <QuickActionsCard />
    </div>
  );
}

// ---- Colonne droite partagée — Mois ----
function MonthSidebar({
  activeAlerts,
  shiftDistribution,
}: {
  activeAlerts: { id: string; message: string; severity: string; type: string; resolved: boolean }[];
  shiftDistribution: { count: number; shift: { id: string; shortName: string; name: string; color: string; textColor: string } }[];
}) {
  return (
    <div className="space-y-4">
      <AlertsCard activeAlerts={activeAlerts} />
      <ShiftDistributionCard shiftDistribution={shiftDistribution} label="Shifts ce mois" />
      <QuickActionsCard />
    </div>
  );
}

// ---- Carte alertes ----
function AlertsCard({
  activeAlerts,
}: {
  activeAlerts: { id: string; message: string; severity: string; type: string; resolved: boolean }[];
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-slate-900">Alertes planning</h2>
        {activeAlerts.length > 0 && (
          <Badge variant="error" className="text-[10px]">
            {activeAlerts.length} active{activeAlerts.length > 1 ? 's' : ''}
          </Badge>
        )}
      </div>
      {activeAlerts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-6 text-center">
          <CheckCircle2 className="h-8 w-8 text-emerald-400 mb-2" />
          <p className="text-sm font-medium text-slate-700">Aucune alerte</p>
          <p className="text-xs text-slate-400 mt-1">Le planning est sans problème</p>
        </div>
      ) : (
        <div className="space-y-2">
          {activeAlerts.slice(0, 4).map((alert) => (
            <AlertItem key={alert.id} alert={alert} />
          ))}
          {activeAlerts.length > 4 && (
            <p className="text-xs text-center text-slate-400 pt-1">
              +{activeAlerts.length - 4} alertes supplémentaires
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ---- Carte distribution des shifts ----
function ShiftDistributionCard({
  shiftDistribution,
  label,
}: {
  shiftDistribution: { count: number; shift: { id: string; shortName: string; name: string; color: string; textColor: string } }[];
  label: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
      <h2 className="text-sm font-semibold text-slate-900 mb-4">{label}</h2>
      <div className="space-y-2.5">
        {shiftDistribution.map(({ shift, count }) => {
          const maxCount = shiftDistribution[0]?.count || 1;
          const percentage = Math.round((count / maxCount) * 100);
          return (
            <div key={shift.id}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span
                    className="inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold"
                    style={{ backgroundColor: shift.color, color: shift.textColor }}
                  >
                    {shift.shortName}
                  </span>
                  <span className="text-xs text-slate-600">{shift.name}</span>
                </div>
                <span className="text-xs font-semibold text-slate-700">{count}</span>
              </div>
              <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${percentage}%`, backgroundColor: shift.textColor, opacity: 0.7 }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---- Carte actions rapides ----
function QuickActionsCard() {
  return (
    <div className="bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-2xl p-5 text-white">
      <h2 className="text-sm font-semibold mb-1">Actions rapides</h2>
      <p className="text-xs text-indigo-200 mb-4">Accédez rapidement aux fonctions clés</p>
      <div className="space-y-2">
        <Link
          href="/planning/monthly"
          className="flex items-center justify-between w-full text-xs font-medium text-white/90 hover:text-white bg-white/10 hover:bg-white/20 rounded-lg px-3 py-2 transition-all"
        >
          <span className="flex items-center gap-2">
            <Calendar className="h-4 w-4" /> Planning mensuel
          </span>
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
        <Link
          href="/employees"
          className="flex items-center justify-between w-full text-xs font-medium text-white/90 hover:text-white bg-white/10 hover:bg-white/20 rounded-lg px-3 py-2 transition-all"
        >
          <span className="flex items-center gap-2">
            <Users className="h-4 w-4" /> Gérer les employés
          </span>
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
        <Link
          href="/shifts"
          className="flex items-center justify-between w-full text-xs font-medium text-white/90 hover:text-white bg-white/10 hover:bg-white/20 rounded-lg px-3 py-2 transition-all"
        >
          <span className="flex items-center gap-2">
            <Briefcase className="h-4 w-4" /> Gérer les shifts
          </span>
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
}
