'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ChevronLeft,
  ChevronRight,
  Pencil,
  CalendarRange,
  Plus,
  Download,
  ChevronDown,
} from 'lucide-react';
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isToday,
  addMonths,
  subMonths,
  getDay,
  isSameMonth,
  parseISO,
} from 'date-fns';
import { fr } from 'date-fns/locale';
import toast from 'react-hot-toast';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  ValidatedTimeEditDialog,
  type ValidatedTimeEditTarget,
} from '@/components/planning/ValidatedTimeEditDialog';
import { EmployeeDeclarationStatsDialog } from '@/components/planning/EmployeeDeclarationStatsDialog';
import { ValidatedShiftDeclarationIcons } from '@/components/planning/ValidatedShiftDeclarationIcons';
import { ManualPunchDialog } from '@/components/planning/ManualPunchDialog';
import { PlanningEmployeeFilterDropdown } from '@/components/planning/PlanningEmployeeFilterDropdown';
import { usePlanningEmployeeFilter } from '@/hooks/usePlanningEmployeeFilter';
import type { Employee } from '@/lib/types';
import { usePeriodDeclarations } from '@/lib/usePeriodDeclarations';
import { usePlanningStore } from '@/lib/store';
import { useShallow } from 'zustand/react/shallow';
import {
  formatHours,
  getInitials,
  hasValidatedTimes,
  getValidatedTimeRange,
  getValidatedEntryDurationHours,
  getPlannedShiftTimeRange,
} from '@/lib/utils';

export default function RealMonthlyPlanningPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const dateParam = searchParams.get('date');

  const {
    employees,
    shifts,
    scheduleEntries,
    settings,
    getValidatedMonthlyHours,
    updateValidatedTimes,
    removeValidatedDay,
  } = usePlanningStore(
    useShallow((s) => ({
      employees: s.employees,
      shifts: s.shifts,
      scheduleEntries: s.scheduleEntries,
      settings: s.settings,
      getValidatedMonthlyHours: s.getValidatedMonthlyHours,
      updateValidatedTimes: s.updateValidatedTimes,
      removeValidatedDay: s.removeValidatedDay,
    }))
  );

  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [editTarget, setEditTarget] = useState<ValidatedTimeEditTarget | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [statsEmployee, setStatsEmployee] = useState<Employee | null>(null);
  const [statsOpen, setStatsOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);

  const holidayMap = new Map((settings.holidays ?? []).map((h) => [h.date, h.name]));
  const shiftMap = useMemo(() => new Map(shifts.map((s) => [s.id, s])), [shifts]);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const monthKey = format(currentMonth, 'yyyy-MM');
  const planningMode = settings.planningMonthMode ?? 'strict';
  const displayStart =
    planningMode === 'full-weeks' ? startOfWeek(monthStart, { weekStartsOn: 1 }) : monthStart;
  const displayEnd =
    planningMode === 'full-weeks' ? endOfWeek(monthEnd, { weekStartsOn: 1 }) : monthEnd;
  const monthDays = eachDayOfInterval({ start: displayStart, end: displayEnd });
  const monthStartStr = format(monthStart, 'yyyy-MM-dd');
  const monthEndStr = format(monthEnd, 'yyyy-MM-dd');
  const displayStartStr = format(displayStart, 'yyyy-MM-dd');
  const displayEndStr = format(displayEnd, 'yyyy-MM-dd');
  const { getDeclarations, reload: reloadDeclarations } = usePeriodDeclarations(displayStartStr, displayEndStr);

  const activeEmployees = useMemo(
    () =>
      employees.filter(
        (e) => e.isActive && !(e.inactiveMonths ?? []).includes(monthKey)
      ),
    [employees, monthKey]
  );

  const { displayedEmployees } = usePlanningEmployeeFilter(activeEmployees);

  useEffect(() => {
    if (!dateParam) return;
    const parsed = parseISO(dateParam);
    if (!Number.isNaN(parsed.getTime())) setCurrentMonth(parsed);
  }, [dateParam]);

  const openEdit = (
    employeeId: string,
    employeeName: string,
    dateStr: string,
    day: Date
  ) => {
    const entry = scheduleEntries.find(
      (e) => e.employeeId === employeeId && e.date === dateStr
    );
    if (!entry || !hasValidatedTimes(entry)) return;
    const shift = shiftMap.get(entry.shiftId);
    const validated = getValidatedTimeRange(entry);
    const planned = getPlannedShiftTimeRange(shift);
    setEditTarget({
      employeeId,
      employeeName,
      date: dateStr,
      dateLabel: format(day, 'EEEE d MMMM', { locale: fr }),
      shiftLabel: shift?.name ?? '',
      validatedStart: validated.start,
      validatedEnd: validated.end,
      plannedStart: planned.start,
      plannedEnd: planned.end,
    });
    setEditOpen(true);
  };

  const validatedCount = useMemo(() => {
    return scheduleEntries.filter(
      (e) =>
        e.date >= monthStartStr &&
        e.date <= monthEndStr &&
        hasValidatedTimes(e) &&
        displayedEmployees.some((emp) => emp.id === e.employeeId)
    ).length;
  }, [scheduleEntries, monthStartStr, monthEndStr, displayedEmployees]);

  const handleExportExcel = async () => {
    const { exportToExcel } = await import('@/lib/export');
    await exportToExcel(
      displayedEmployees,
      shifts,
      scheduleEntries,
      displayStartStr,
      displayEndStr,
      settings.companyName,
      monthStartStr,
      true
    );
    toast.success('Planning réel exporté en Excel');
  };

  const handleExportPDF = async () => {
    const { exportToPDF } = await import('@/lib/export');
    await exportToPDF(
      displayedEmployees,
      shifts,
      scheduleEntries,
      displayStartStr,
      displayEndStr,
      settings.companyName,
      monthStartStr,
      settings.holidays ?? [],
      true
    );
    toast.success('PDF téléchargé — vérifiez votre dossier Téléchargements');
  };

  return (
    <div className="flex flex-col min-h-screen bg-slate-50/50">
      <Header
        title="Planning réel"
        subtitle="Jours validés via les pointages — ajoutez une journée oubliée ou modifiez les heures réelles"
        actions={
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5">
                <Download className="h-4 w-4" />
                <ChevronDown className="h-3.5 w-3.5 opacity-50" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Exporter</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => void handleExportExcel()}>
                Excel
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void handleExportPDF()}>
                PDF
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        }
      />

      <div className="flex-1 p-4 md:p-6 space-y-4">
        {/* Barre de navigation */}
        <div className="flex flex-wrap items-center gap-3 justify-between">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setCurrentMonth((d) => subMonths(d, 1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <h2 className="text-lg font-bold text-slate-800 capitalize min-w-[180px] text-center">
              {format(currentMonth, 'MMMM yyyy', { locale: fr })}
            </h2>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setCurrentMonth((d) => addMonths(d, 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                router.push(`/planning/real/weekly?date=${format(currentMonth, 'yyyy-MM-dd')}`)
              }
              className="text-xs ml-1 gap-1.5"
            >
              <CalendarRange className="h-3.5 w-3.5" />
              Vue hebdomadaire
            </Button>
            <Button
              type="button"
              size="sm"
              className="text-xs gap-1.5 bg-indigo-600 hover:bg-indigo-700"
              onClick={() => setManualOpen(true)}
            >
              <Plus className="h-3.5 w-3.5" />
              Ajouter un pointage
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 hidden sm:inline">
              {validatedCount} jour{validatedCount !== 1 ? 's' : ''} validé{validatedCount !== 1 ? 's' : ''}
            </span>

            <PlanningEmployeeFilterDropdown activeEmployees={activeEmployees} />
          </div>
        </div>

        {/* Grille */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-auto">
          <table className="w-full border-collapse min-w-[800px]">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/80">
                <th className="sticky left-0 z-10 bg-slate-50/95 border-r border-slate-100 px-3 py-2 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wide min-w-[140px]">
                  Employé
                </th>
                {monthDays.map((day) => {
                  const dateStr = format(day, 'yyyy-MM-dd');
                  const isTd = isToday(day);
                  const isWE = getDay(day) === 0 || getDay(day) === 6;
                  const isHoliday = holidayMap.has(dateStr);
                  const inMonth = isSameMonth(day, currentMonth);
                  return (
                    <th
                      key={dateStr}
                      className={`border-r border-slate-100 px-1 py-2 text-center min-w-[52px] ${
                        !inMonth ? 'opacity-40' : ''
                      } ${isTd ? 'bg-indigo-50/50' : isHoliday ? 'bg-amber-50/50' : isWE ? 'bg-slate-100/50' : ''}`}
                    >
                      <p className="text-[10px] font-bold text-slate-400 uppercase">
                        {format(day, 'EEE', { locale: fr })}
                      </p>
                      <p className={`text-xs font-semibold ${isTd ? 'text-indigo-600' : 'text-slate-700'}`}>
                        {format(day, 'd')}
                      </p>
                    </th>
                  );
                })}
                <th className="px-2 py-2 text-center text-[10px] font-bold text-slate-400 uppercase min-w-[52px]">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {displayedEmployees.length === 0 ? (
                <tr>
                  <td colSpan={monthDays.length + 2} className="px-4 py-12 text-center text-sm text-slate-400">
                    Aucun employé sélectionné
                  </td>
                </tr>
              ) : (
                displayedEmployees.map((employee) => {
                  const monthlyHours = getValidatedMonthlyHours(
                    employee.id,
                    monthStartStr,
                    monthEndStr
                  );
                  const empName = `${employee.firstName}${employee.lastName ? ` ${employee.lastName}` : ''}`.trim();

                  return (
                    <tr key={employee.id} className="border-b border-slate-50 hover:bg-slate-50/40 group/row">
                      <td className="sticky left-0 z-10 bg-white group-hover/row:bg-slate-50/80 border-r border-slate-100 px-3 py-2">
                        <button
                          type="button"
                          onClick={() => {
                            setStatsEmployee(employee);
                            setStatsOpen(true);
                          }}
                          className="flex items-center gap-2 w-full text-left rounded-lg -mx-1 px-1 py-0.5 hover:bg-indigo-50/80 transition-colors group/name"
                          title="Voir repas, collation et pauses"
                        >
                          <div
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                            style={{ backgroundColor: employee.color }}
                          >
                            {getInitials(employee.firstName, employee.lastName)}
                          </div>
                          <p className="text-xs font-semibold text-slate-800 truncate group-hover/name:text-indigo-700">
                            {empName}
                          </p>
                        </button>
                      </td>

                      {monthDays.map((day) => {
                        const dateStr = format(day, 'yyyy-MM-dd');
                        const entry = scheduleEntries.find(
                          (e) => e.employeeId === employee.id && e.date === dateStr
                        );
                        const validated = entry && hasValidatedTimes(entry);
                        const shift = entry ? shiftMap.get(entry.shiftId) : null;
                        const times = validated && entry ? getValidatedTimeRange(entry) : null;
                        const inMonth = isSameMonth(day, currentMonth);
                        const declFlags = getDeclarations(employee.id, dateStr);

                        return (
                          <td
                            key={dateStr}
                            className={`border-r border-slate-100 p-0.5 ${!inMonth ? 'opacity-40' : ''}`}
                          >
                            {validated && shift && times ? (
                              <button
                                type="button"
                                onClick={() => openEdit(employee.id, empName, dateStr, day)}
                                className="w-full rounded-md flex flex-col items-center justify-center py-1 px-0.5 min-h-[48px] hover:brightness-95 transition-all group/cell relative"
                                style={{ backgroundColor: shift.color }}
                                title="Cliquer pour modifier les heures réelles"
                              >
                                <span
                                  className="font-bold text-[10px] leading-none"
                                  style={{ color: shift.textColor }}
                                >
                                  {times.start}–{times.end}
                                </span>
                                <ValidatedShiftDeclarationIcons
                                  flags={declFlags}
                                  textColor={shift.textColor}
                                  size="sm"
                                />
                                <Pencil
                                  className="absolute top-0.5 right-0.5 h-2.5 w-2.5 opacity-0 group-hover/cell:opacity-60"
                                  style={{ color: shift.textColor }}
                                />
                              </button>
                            ) : (
                              <div className="min-h-[42px]" />
                            )}
                          </td>
                        );
                      })}

                      <td className="text-center px-1">
                        <span className="text-xs font-semibold text-indigo-600">
                          {monthlyHours > 0 ? formatHours(monthlyHours) : '—'}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-200 bg-slate-50">
                <td className="sticky left-0 z-10 bg-slate-50 border-r border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600">
                  Total / jour
                </td>
                {monthDays.map((day) => {
                  const dateStr = format(day, 'yyyy-MM-dd');
                  const dayTotal = displayedEmployees.reduce((sum, emp) => {
                    const entry = scheduleEntries.find(
                      (e) => e.employeeId === emp.id && e.date === dateStr
                    );
                    return sum + (entry ? getValidatedEntryDurationHours(entry) : 0);
                  }, 0);
                  return (
                    <td key={dateStr} className="border-r border-slate-200 px-1 py-2 text-center">
                      <span className="text-[10px] font-semibold text-slate-600">
                        {dayTotal > 0 ? formatHours(dayTotal) : '—'}
                      </span>
                    </td>
                  );
                })}
                <td className="text-center px-2 py-2">
                  <span className="text-xs font-bold text-indigo-600">
                    {formatHours(
                      displayedEmployees.reduce(
                        (sum, emp) =>
                          sum + getValidatedMonthlyHours(emp.id, monthStartStr, monthEndStr),
                        0
                      )
                    )}
                  </span>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        <p className="text-xs text-slate-400">
          Seuls les jours avec pointage approuvé apparaissent ici. Utilisez{' '}
          <strong className="font-medium text-slate-500">Ajouter un pointage</strong>{' '}
          pour une journée oubliée, ou l’onglet Pointages pour valider les pointages
          employés.
          {' '}Sous les horaires : pause (⏸), collation (☕), repas au travail (🍴) si cochés à la fin de service.
        </p>
      </div>

      <ManualPunchDialog
        open={manualOpen}
        onOpenChange={setManualOpen}
        onDone={() => reloadDeclarations()}
      />

      <ValidatedTimeEditDialog
        target={editTarget}
        open={editOpen}
        onOpenChange={setEditOpen}
        onSave={async (start, end) => {
          if (!editTarget) return;
          await updateValidatedTimes(editTarget.employeeId, editTarget.date, start, end);
        }}
        onDelete={async () => {
          if (!editTarget) return;
          await removeValidatedDay(editTarget.employeeId, editTarget.date);
          reloadDeclarations();
        }}
      />

      <EmployeeDeclarationStatsDialog
        employee={statsEmployee}
        open={statsOpen}
        onOpenChange={(open) => {
          setStatsOpen(open);
          if (!open) setStatsEmployee(null);
        }}
        rangeStart={monthStartStr}
        rangeEnd={monthEndStr}
        periodLabel={format(currentMonth, 'MMMM yyyy', { locale: fr })}
        view="month"
      />
    </div>
  );
}
