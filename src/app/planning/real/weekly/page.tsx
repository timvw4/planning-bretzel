'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Pencil,
  Plus,
  Download,
  ChevronDown,
} from 'lucide-react';
import {
  format,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isToday,
  addWeeks,
  subWeeks,
  getDay,
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

export default function RealWeeklyPlanningPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const dateParam = searchParams.get('date');

  const {
    employees,
    shifts,
    scheduleEntries,
    settings,
    getValidatedWeeklyHours,
    updateValidatedTimes,
    removeValidatedDay,
  } = usePlanningStore(
    useShallow((s) => ({
      employees: s.employees,
      shifts: s.shifts,
      scheduleEntries: s.scheduleEntries,
      settings: s.settings,
      getValidatedWeeklyHours: s.getValidatedWeeklyHours,
      updateValidatedTimes: s.updateValidatedTimes,
      removeValidatedDay: s.removeValidatedDay,
    }))
  );

  const [currentWeekDate, setCurrentWeekDate] = useState(new Date());
  const [editTarget, setEditTarget] = useState<ValidatedTimeEditTarget | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [statsEmployee, setStatsEmployee] = useState<Employee | null>(null);
  const [statsOpen, setStatsOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);

  const shiftMap = useMemo(() => new Map(shifts.map((s) => [s.id, s])), [shifts]);

  const weekStart = startOfWeek(currentWeekDate, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(currentWeekDate, { weekStartsOn: 1 });
  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });
  const weekStartStr = format(weekStart, 'yyyy-MM-dd');
  const weekEndStr = format(weekEnd, 'yyyy-MM-dd');
  const weekMonthKey = format(weekStart, 'yyyy-MM');
  const { getDeclarations, reload: reloadDeclarations } = usePeriodDeclarations(weekStartStr, weekEndStr);

  const activeEmployees = useMemo(
    () =>
      employees.filter(
        (e) => e.isActive && !(e.inactiveMonths ?? []).includes(weekMonthKey)
      ),
    [employees, weekMonthKey]
  );

  const { displayedEmployees } = usePlanningEmployeeFilter(activeEmployees);

  useEffect(() => {
    if (!dateParam) return;
    const parsed = parseISO(dateParam);
    if (!Number.isNaN(parsed.getTime())) setCurrentWeekDate(parsed);
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
    const decl = getDeclarations(employeeId, dateStr);
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
      pause15min: decl?.pause_15min ?? true,
      hadSnack: decl?.had_snack ?? false,
      ateWorkFood: decl?.ate_work_food ?? false,
    });
    setEditOpen(true);
  };

  const validatedCount = useMemo(() => {
    return scheduleEntries.filter(
      (e) =>
        e.date >= weekStartStr &&
        e.date <= weekEndStr &&
        hasValidatedTimes(e) &&
        displayedEmployees.some((emp) => emp.id === e.employeeId)
    ).length;
  }, [scheduleEntries, weekStartStr, weekEndStr, displayedEmployees]);

  const totalWeekHours = displayedEmployees.reduce(
    (sum, emp) => sum + getValidatedWeeklyHours(emp.id, weekStartStr, weekEndStr),
    0
  );

  const handleExportExcel = async () => {
    const { exportToExcel } = await import('@/lib/export');
    await exportToExcel(
      displayedEmployees,
      shifts,
      scheduleEntries,
      weekStartStr,
      weekEndStr,
      settings.companyName,
      `${weekMonthKey}-01`,
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
      weekStartStr,
      weekEndStr,
      settings.companyName,
      `${weekMonthKey}-01`,
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
        <div className="flex flex-wrap items-center gap-3 justify-between">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setCurrentWeekDate((d) => subWeeks(d, 1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <h2 className="text-lg font-bold text-slate-800 min-w-[220px] text-center">
              {format(weekStart, 'd MMM', { locale: fr })} – {format(weekEnd, 'd MMM yyyy', { locale: fr })}
            </h2>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setCurrentWeekDate((d) => addWeeks(d, 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                router.push(`/planning/real/monthly?date=${format(weekStart, 'yyyy-MM-dd')}`)
              }
              className="text-xs ml-1 gap-1.5"
            >
              <CalendarDays className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Vue mensuelle</span>
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

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-auto">
          <table className="w-full border-collapse min-w-[700px]">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/80">
                <th className="sticky left-0 z-10 bg-slate-50/95 border-r border-slate-100 px-3 py-2 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wide min-w-[140px]">
                  Employé
                </th>
                {weekDays.map((day) => {
                  const dateStr = format(day, 'yyyy-MM-dd');
                  const isTd = isToday(day);
                  const isWE = getDay(day) === 0 || getDay(day) === 6;
                  return (
                    <th
                      key={dateStr}
                      className={`border-r border-slate-100 px-2 py-2 text-center min-w-[80px] ${
                        isTd ? 'bg-indigo-50/50' : isWE ? 'bg-slate-100/50' : ''
                      }`}
                    >
                      <p className="text-[10px] font-bold text-slate-400 uppercase">
                        {format(day, 'EEE', { locale: fr })}
                      </p>
                      <p className={`text-sm font-semibold ${isTd ? 'text-indigo-600' : 'text-slate-700'}`}>
                        {format(day, 'd')}
                      </p>
                    </th>
                  );
                })}
                <th className="px-2 py-2 text-center text-[10px] font-bold text-slate-400 uppercase min-w-[60px]">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {displayedEmployees.length === 0 ? (
                <tr>
                  <td colSpan={weekDays.length + 2} className="px-4 py-12 text-center text-sm text-slate-400">
                    Aucun employé sélectionné
                  </td>
                </tr>
              ) : (
                displayedEmployees.map((employee) => {
                  const weekHours = getValidatedWeeklyHours(
                    employee.id,
                    weekStartStr,
                    weekEndStr
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

                      {weekDays.map((day) => {
                        const dateStr = format(day, 'yyyy-MM-dd');
                        const entry = scheduleEntries.find(
                          (e) => e.employeeId === employee.id && e.date === dateStr
                        );
                        const validated = entry && hasValidatedTimes(entry);
                        const shift = entry ? shiftMap.get(entry.shiftId) : null;
                        const times = validated && entry ? getValidatedTimeRange(entry) : null;
                        const declFlags = getDeclarations(employee.id, dateStr);

                        return (
                          <td key={dateStr} className="border-r border-slate-100 p-1">
                            {validated && shift && times ? (
                              <button
                                type="button"
                                onClick={() => openEdit(employee.id, empName, dateStr, day)}
                                className="w-full rounded-xl flex flex-col items-center justify-center py-2 px-1 min-h-[64px] hover:brightness-95 transition-all group/cell relative"
                                style={{ backgroundColor: shift.color }}
                                title="Cliquer pour modifier les heures réelles"
                              >
                                <span
                                  className="font-bold text-xs leading-none"
                                  style={{ color: shift.textColor }}
                                >
                                  {times.start} – {times.end}
                                </span>
                                <ValidatedShiftDeclarationIcons
                                  flags={declFlags}
                                  textColor={shift.textColor}
                                  size="md"
                                />
                                <Pencil
                                  className="absolute top-1 right-1 h-3 w-3 opacity-0 group-hover/cell:opacity-60"
                                  style={{ color: shift.textColor }}
                                />
                              </button>
                            ) : (
                              <div className="min-h-[64px] rounded-xl border border-dashed border-slate-100 bg-slate-50/30" />
                            )}
                          </td>
                        );
                      })}

                      <td className="text-center px-2">
                        <span className="text-sm font-bold text-indigo-600">
                          {weekHours > 0 ? formatHours(weekHours) : '—'}
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
                {weekDays.map((day) => {
                  const dateStr = format(day, 'yyyy-MM-dd');
                  const dayTotal = displayedEmployees.reduce((sum, emp) => {
                    const entry = scheduleEntries.find(
                      (e) => e.employeeId === emp.id && e.date === dateStr
                    );
                    return sum + (entry ? getValidatedEntryDurationHours(entry) : 0);
                  }, 0);
                  return (
                    <td key={dateStr} className="border-r border-slate-200 px-2 py-2 text-center">
                      <span className="text-xs font-semibold text-slate-600">
                        {dayTotal > 0 ? formatHours(dayTotal) : '—'}
                      </span>
                    </td>
                  );
                })}
                <td className="text-center px-2 py-2">
                  <span className="text-sm font-bold text-indigo-600">
                    {formatHours(totalWeekHours)}
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
        onSave={async (start, end, options) => {
          if (!editTarget) return;
          await updateValidatedTimes(
            editTarget.employeeId,
            editTarget.date,
            start,
            end,
            options
          );
          reloadDeclarations();
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
        rangeStart={weekStartStr}
        rangeEnd={weekEndStr}
        periodLabel={`${format(weekStart, 'd MMM', { locale: fr })} – ${format(weekEnd, 'd MMM yyyy', { locale: fr })}`}
        view="week"
      />
    </div>
  );
}
