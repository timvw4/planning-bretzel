'use client';

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  AlertTriangle,
  Clock,
  Download,
  Info,
  Eraser,
  Send,
  CalendarDays,
} from 'lucide-react';
import {
  format,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isToday,
  isWeekend,
  addWeeks,
  subWeeks,
  parseISO,
  getDay,
} from 'date-fns';
import { fr } from 'date-fns/locale';
import toast from 'react-hot-toast';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ShiftPicker } from '@/components/planning/ShiftPicker';
import { PlanningPublicationStatusBar } from '@/components/planning/PlanningPublicationStatusBar';
import { PlanningEmployeeFilterDropdown } from '@/components/planning/PlanningEmployeeFilterDropdown';
import { usePlanningEmployeeFilter } from '@/hooks/usePlanningEmployeeFilter';
import { usePlanningStore } from '@/lib/store';
import { useShallow } from 'zustand/react/shallow';
import {
  formatDate,
  formatHours,
  getInitials,
  calcPickerPosition,
  getPlannedShiftTimeRange,
  getPlannedEntryDurationHours,
  calculateShiftDuration,
  availabilityMapKey,
  detectAlerts,
} from '@/lib/utils';
import { AvailabilityStatusIcon, availabilityStatusMeta } from '@/components/availability/AvailabilityStatusIcon';
import { getPositionLabel } from '@/lib/employeePosition';
import type { PlanningAlert } from '@/lib/types';

export default function WeeklyPlanningPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const dateParam = searchParams.get('date');

  const {
    employees,
    shifts,
    scheduleEntries,
    assignShift,
    removeShift,
    getWeeklyHours,
    copyWeek,
    alerts,
    settings,
    publishWeekForEmployees,
    availabilityStatusByKey,
    mergeAvailabilityRequests,
  } = usePlanningStore(
    useShallow((s) => ({
      employees: s.employees,
      shifts: s.shifts,
      scheduleEntries: s.scheduleEntries,
      assignShift: s.assignShift,
      removeShift: s.removeShift,
      getWeeklyHours: s.getWeeklyHours,
      copyWeek: s.copyWeek,
      alerts: s.alerts,
      settings: s.settings,
      publishWeekForEmployees: s.publishWeekForEmployees,
      availabilityStatusByKey: s.availabilityStatusByKey,
      mergeAvailabilityRequests: s.mergeAvailabilityRequests,
    }))
  );

  const [currentWeekDate, setCurrentWeekDate] = useState(new Date());
  const [activeCell, setActiveCell] = useState<{ empId: string; date: string } | null>(null);
  const [pickerPos, setPickerPos] = useState<{ x: number; y: number } | null>(null);
  const [hoveredCell, setHoveredCell] = useState<{ empId: string; date: string } | null>(null);
  const [brushShiftId, setBrushShiftId] = useState<string | null>(null);
  const [eraseMode, setEraseMode] = useState(false);
  const [publishDialogOpen, setPublishDialogOpen] = useState(false);
  const [publishSubmitting, setPublishSubmitting] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  const weekStart = startOfWeek(currentWeekDate, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(currentWeekDate, { weekStartsOn: 1 });
  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });
  const weekStartStr = format(weekStart, 'yyyy-MM-dd');
  const weekEndStr = format(weekEnd, 'yyyy-MM-dd');
  const weekMonthKey = format(weekStart, 'yyyy-MM');

  useEffect(() => {
    if (!dateParam) return;
    const parsed = parseISO(dateParam);
    if (!Number.isNaN(parsed.getTime())) setCurrentWeekDate(parsed);
  }, [dateParam]);

  const activeEmployees = useMemo(
    () =>
      employees.filter(
        (e) => e.isActive && !(e.inactiveMonths ?? []).includes(weekMonthKey)
      ),
    [employees, weekMonthKey]
  );

  const { displayedEmployees } = usePlanningEmployeeFilter(activeEmployees);

  const shiftMap = new Map(shifts.map((s) => [s.id, s]));
  const holidayMap = new Map((settings.holidays ?? []).map((h) => [h.date, h.name]));

  const viewedWeekAlerts = useMemo(
    () => detectAlerts(scheduleEntries, employees, shifts, weekStartStr, weekEndStr),
    [scheduleEntries, employees, shifts, weekStartStr, weekEndStr]
  );

  const activeAlerts = useMemo(() => {
    const merged = new Map<string, PlanningAlert>();
    for (const alert of viewedWeekAlerts) {
      merged.set(alert.id, alert);
    }
    for (const alert of alerts) {
      if (alert.resolved) continue;
      if (
        alert.type === 'validated_unavailable' &&
        alert.date &&
        alert.date >= weekStartStr &&
        alert.date <= weekEndStr
      ) {
        merged.set(alert.id, alert);
      }
      if (alert.type === 'geofence_clock_in' || alert.type === 'geofence_clock_out') {
        merged.set(alert.id, alert);
      }
    }
    return [...merged.values()];
  }, [viewedWeekAlerts, alerts, weekStartStr, weekEndStr]);

  useEffect(() => {
    void mergeAvailabilityRequests(weekStartStr, weekEndStr);
  }, [weekStartStr, weekEndStr, mergeAvailabilityRequests]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setActiveCell(null);
        setPickerPos(null);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Échap pour quitter le pinceau / la gomme
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setBrushShiftId(null);
        setEraseMode(false);
        setActiveCell(null);
        setPickerPos(null);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const handleCellClick = useCallback(
    (empId: string, date: string, e: React.MouseEvent) => {
      e.stopPropagation();

      // Mode gomme : effacement direct
      if (eraseMode) {
        removeShift(empId, date);
        return;
      }

      // Mode pinceau : assignation directe, ou retrait si la case a déjà ce shift
      if (brushShiftId) {
        const existing = scheduleEntries.find(
          (e) => e.employeeId === empId && e.date === date
        );
        if (existing?.shiftId === brushShiftId) {
          removeShift(empId, date);
        } else {
          assignShift(empId, date, brushShiftId);
        }
        return;
      }

      // Mode normal : picker
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      if (activeCell?.empId === empId && activeCell?.date === date) {
        setActiveCell(null);
        setPickerPos(null);
      } else {
        setActiveCell({ empId, date });
        setPickerPos(calcPickerPosition(rect));
      }
    },
    [activeCell, brushShiftId, eraseMode, scheduleEntries, assignShift, removeShift]
  );

  const handleBrushSelect = (shiftId: string) => {
    setBrushShiftId((prev) => (prev === shiftId ? null : shiftId));
    setEraseMode(false);
    setActiveCell(null);
    setPickerPos(null);
  };

  const handleEraseToggle = () => {
    setEraseMode((prev) => !prev);
    setBrushShiftId(null);
    setActiveCell(null);
    setPickerPos(null);
  };

  const brushShift = brushShiftId ? shiftMap.get(brushShiftId) : null;

  const handleShiftSelect = (shiftId: string) => {
    if (!activeCell) return;
    assignShift(activeCell.empId, activeCell.date, shiftId);
    const shift = shiftMap.get(shiftId);
    toast.success(`Shift "${shift?.name}" assigné`);
    setActiveCell(null);
    setPickerPos(null);
  };

  const handleShiftClear = () => {
    if (!activeCell) return;
    removeShift(activeCell.empId, activeCell.date);
    toast.success('Assignation supprimée');
    setActiveCell(null);
    setPickerPos(null);
  };

  const handleCopyWeek = () => {
    const nextWeekStart = format(addWeeks(weekStart, 1), 'yyyy-MM-dd');
    copyWeek(weekStartStr, nextWeekStart);
    toast.success('Semaine copiée vers la semaine suivante');
  };

  const handleConfirmPublishWeek = async () => {
    setPublishSubmitting(true);
    try {
      await publishWeekForEmployees(weekStartStr, weekEndStr);
      toast.success(
        `La semaine du ${formatDate(weekStartStr)} au ${formatDate(weekEndStr)} est visible pour les employés.`
      );
      setPublishDialogOpen(false);
    } catch (e) {
      console.error(e);
      toast.error(
        'Publication impossible. Vérifiez la connexion et la colonne visible_to_employee sur schedule_entries.'
      );
    } finally {
      setPublishSubmitting(false);
    }
  };

  const activeCell_entry = activeCell
    ? scheduleEntries.find(
        (e) => e.employeeId === activeCell.empId && e.date === activeCell.date
      )
    : null;
  const activeEmployee = activeCell ? employees.find((e) => e.id === activeCell.empId) : null;

  // Calcul total heures semaine global (sur les employés affichés)
  const totalWeekHours = displayedEmployees.reduce((sum, emp) => {
    return sum + getWeeklyHours(emp.id, weekStartStr, weekEndStr);
  }, 0);

  const getCellAlerts = (empId: string, date: string) =>
    activeAlerts.filter((a) => a.employeeId === empId && a.date === date);

  const getEmpAlerts = (empId: string) =>
    activeAlerts.filter((a) => a.employeeId === empId);

  return (
    <div className="animate-fade-in flex flex-col h-screen">
      <Header
        title="Planning prévu"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleCopyWeek}>
              <Copy className="h-4 w-4" />
              Copier la semaine
            </Button>
            <Button
              variant="default"
              size="sm"
              className="gap-1.5 bg-emerald-600 hover:bg-emerald-700"
              onClick={() => setPublishDialogOpen(true)}
            >
              <Send className="h-4 w-4" />
              Envoyer la semaine
            </Button>
          </div>
        }
      />

      <Dialog open={publishDialogOpen} onOpenChange={setPublishDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Envoyer la semaine aux employés ?</DialogTitle>
            <DialogDescription asChild>
              <div className="text-sm text-slate-600 space-y-2 pt-1">
                <p>
                  Tous les créneaux du{' '}
                  <strong>
                    {format(weekStart, 'd MMM', { locale: fr })} au {format(weekEnd, 'd MMM yyyy', { locale: fr })}
                  </strong>{' '}
                  deviennent visibles sur le compte employé.
                </p>
                <p className="text-xs text-slate-500">
                  Les shifts en brouillon (cadre en pointillés) seront inclus. Les employés ne voient que les jours
                  publiés ; vous pouvez envoyer mois par mois ou semaine par semaine selon votre usage.
                </p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setPublishDialogOpen(false)} disabled={publishSubmitting}>
              Annuler
            </Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700"
              onClick={() => void handleConfirmPublishWeek()}
              disabled={publishSubmitting}
            >
              {publishSubmitting ? 'Envoi…' : "Confirmer l'envoi"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Toolbar navigation */}
      <div className="bg-white border-b border-slate-100">
        {/* Ligne 1 : navigation + stats */}
        <div className="flex items-center justify-between px-3 sm:px-6 py-3">
          <div className="flex items-center gap-1 sm:gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setCurrentWeekDate((d) => subWeeks(d, 1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-xs sm:text-sm font-semibold text-slate-900 text-center capitalize">
              <span className="hidden sm:inline">Semaine du </span>
              {format(weekStart, 'd MMM', { locale: fr })}
              <span className="hidden sm:inline"> au </span>
              <span className="sm:hidden"> – </span>
              {format(weekEnd, 'd MMM yyyy', { locale: fr })}
            </span>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setCurrentWeekDate((d) => addWeeks(d, 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <PlanningEmployeeFilterDropdown activeEmployees={activeEmployees} />
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                router.push(`/planning/monthly?date=${format(weekStart, 'yyyy-MM-dd')}`)
              }
              className="text-xs ml-1 sm:ml-2 gap-1.5"
            >
              <CalendarDays className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Vue mensuelle</span>
            </Button>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-slate-400 uppercase tracking-wide hidden sm:block">Total semaine</p>
            <p className="text-sm font-bold text-slate-900">{formatHours(totalWeekHours)}</p>
          </div>
        </div>

        <PlanningPublicationStatusBar
          periodStart={weekStartStr}
          periodEnd={weekEndStr}
          scheduleEntries={scheduleEntries}
          periodLabel={`du ${format(weekStart, 'd MMMM', { locale: fr })} au ${format(weekEnd, 'd MMMM yyyy', {
            locale: fr,
          })}`}
        />

        {/* Ligne 2 : légende shifts + pinceau + gomme */}
        <div className="flex items-center gap-2 px-6 pb-3 flex-wrap">
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mr-1 shrink-0">
            Sélectionner :
          </span>
          {shifts.filter((s) => s.isActive).map((shift) => {
            const isActive = brushShiftId === shift.id;
            return (
              <button
                key={shift.id}
                onClick={() => handleBrushSelect(shift.id)}
                title={`Peindre "${shift.name}"`}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-bold whitespace-nowrap transition-all duration-150 ${
                  isActive
                    ? 'ring-2 ring-offset-1 ring-slate-700 scale-110 shadow-md'
                    : 'hover:scale-105 hover:shadow-sm opacity-75 hover:opacity-100'
                }`}
                style={{ backgroundColor: shift.color, color: shift.textColor }}
              >
                {shift.shortName}
              </button>
            );
          })}
          <div className="h-4 w-px bg-slate-200 mx-1 shrink-0" />
          <button
            onClick={handleEraseToggle}
            title="Effacer des shifts en cliquant sur les cases"
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold whitespace-nowrap transition-all duration-150 border shrink-0 ${
              eraseMode
                ? 'bg-red-500 text-white border-red-500 ring-2 ring-offset-1 ring-red-500 scale-110 shadow-md'
                : 'bg-white text-slate-500 border-slate-200 hover:border-red-300 hover:text-red-500 hover:scale-105'
            }`}
          >
            <Eraser className="h-3 w-3" />
            Effacer
          </button>
          {(brushShiftId || eraseMode) && (
            <span className={`ml-2 text-[10px] font-semibold border rounded-lg px-2 py-1 flex items-center gap-1 shrink-0 ${
              eraseMode
                ? 'text-red-600 bg-red-50 border-red-200'
                : 'text-indigo-600 bg-indigo-50 border-indigo-200'
            }`}>
              {eraseMode ? '🧹 Gomme active' : '🖌 Pinceau actif'} — Échap pour quitter
            </span>
          )}
        </div>
      </div>

      {/* Planning hebdomadaire — Vue principale */}
      <div className="flex-1 overflow-auto bg-slate-50">
        <div className="bg-white [overflow:clip]" style={{ cursor: brushShiftId ? 'crosshair' : eraseMode ? 'cell' : 'default' }}>
          <table className="w-full border-collapse">
            <thead className="sticky top-0 z-20 bg-white shadow-sm">
              <tr className="border-b border-slate-200">
                {/* Colonne employés — sticky pour rester visible au défilement horizontal */}
                <th className="sticky left-0 z-30 w-10 sm:w-52 min-w-[2.5rem] sm:min-w-[13rem] border-r border-slate-100 px-2 sm:px-4 py-4 text-left bg-slate-50/50 shadow-[2px_0_4px_rgba(0,0,0,0.04)]">
                  <span className="hidden sm:inline text-xs font-semibold text-slate-400 uppercase tracking-wide">
                    Employé
                  </span>
                </th>

                {/* 7 jours */}
                {weekDays.map((day) => {
                  const isWE       = isWeekend(day);
                  const isTd       = isToday(day);
                  const dateStr    = format(day, 'yyyy-MM-dd');
                  const isHoliday  = holidayMap.has(dateStr);
                  const holidayName = holidayMap.get(dateStr);
                  return (
                    <th
                      key={day.toISOString()}
                      title={isHoliday ? holidayName : undefined}
                      className={`border-r border-slate-100 px-3 py-4 text-center ${
                        isTd
                          ? 'bg-indigo-50/30'
                          : isHoliday
                          ? 'bg-amber-50'
                          : isWE
                          ? 'bg-slate-50'
                          : 'bg-white'
                      }`}
                    >
                      <p
                        className={`text-[10px] font-semibold uppercase tracking-widest ${
                          isTd ? 'text-indigo-500' : isHoliday ? 'text-amber-500' : 'text-slate-400'
                        }`}
                      >
                        {format(day, 'EEE', { locale: fr })}
                      </p>
                      <div
                        className={`mt-1 w-8 h-8 rounded-full flex items-center justify-center mx-auto text-sm font-bold ${
                          isTd
                            ? 'bg-indigo-600 text-white'
                            : isHoliday
                            ? 'bg-amber-400 text-white'
                            : isWE
                            ? 'text-slate-400'
                            : 'text-slate-800'
                        }`}
                      >
                        {day.getDate()}
                      </div>
                      {isHoliday && (
                        <p className="mt-0.5 text-[9px] text-amber-500 font-medium leading-tight truncate max-w-[80px] mx-auto">
                          {holidayName && holidayName.length > 10 ? holidayName.slice(0, 9) + '…' : holidayName}
                        </p>
                      )}
                    </th>
                  );
                })}

                {/* Colonne total — cachée sur mobile */}
                <th className="hidden sm:table-cell px-4 py-4 text-center bg-slate-50/50 w-20">
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">
                    Sem.
                  </span>
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-50">
              {displayedEmployees.map((employee, empIdx) => {
                const weeklyHours = getWeeklyHours(employee.id, weekStartStr, weekEndStr);
                const overHours = weeklyHours > employee.contractHours;
                const empAlertsList = getEmpAlerts(employee.id);

                return (
                  <tr
                    key={employee.id}
                    className={`group ${empIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50/20'} hover:bg-indigo-50/10 transition-colors`}
                  >
                    {/* Infos employé — sticky comme l'en-tête */}
                    <td
                      className={`sticky left-0 z-10 border-r border-slate-200 px-2 sm:px-4 py-2 sm:py-3 shadow-[2px_0_4px_rgba(0,0,0,0.04)] ${
                        empIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50/20'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center text-xs font-bold text-white shadow-sm shrink-0 relative"
                          style={{ backgroundColor: employee.color }}
                          title={`${employee.firstName} ${employee.lastName}`}
                        >
                          {getInitials(employee.firstName, employee.lastName)}
                          {empAlertsList.length > 0 && (
                            <div className="absolute -top-1 -right-1 w-3 h-3 bg-amber-500 rounded-full border border-white" />
                          )}
                        </div>
                        <div className="hidden sm:block min-w-0">
                          <p className="text-sm font-semibold text-slate-800">
                            {employee.firstName} {employee.lastName}
                          </p>
                          <p className="text-xs text-slate-400 truncate">{getPositionLabel(employee.position)}</p>
                        </div>
                        {empAlertsList.length > 0 && (
                          <div
                            className="hidden sm:flex w-5 h-5 rounded-full bg-amber-100 items-center justify-center shrink-0"
                            title={`${empAlertsList.length} alerte(s)`}
                          >
                            <AlertTriangle className="h-3 w-3 text-amber-600" />
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Cellules jours */}
                    {weekDays.map((day) => {
                      const dateStr = format(day, 'yyyy-MM-dd');
                      const entry = scheduleEntries.find(
                        (e) => e.employeeId === employee.id && e.date === dateStr
                      );
                      const shift = entry ? shiftMap.get(entry.shiftId) : null;
                      const isWE = isWeekend(day);
                      const isTd = isToday(day);
                      const isHolidayCell = holidayMap.has(dateStr);
                      const isActive =
                        activeCell?.empId === employee.id && activeCell?.date === dateStr;
                      const cellAlerts = getCellAlerts(employee.id, dateStr);
                      const availDisp = availabilityStatusMeta(
                        availabilityStatusByKey[availabilityMapKey(employee.id, dateStr)]
                      );

                      return (
                        <td
                          key={dateStr}
                          className={`border-r border-slate-100 px-2 py-2 cursor-pointer ${
                            isHolidayCell && !shift ? 'bg-amber-50/40' : isWE && !shift ? 'bg-slate-50/30' : ''
                          } ${isTd ? 'bg-indigo-50/20' : ''}`}
                          onClick={(e) => handleCellClick(employee.id, dateStr, e)}
                          onMouseEnter={() => setHoveredCell({ empId: employee.id, date: dateStr })}
                          onMouseLeave={() => setHoveredCell(null)}
                        >
                          <div
                            className={`relative min-h-[44px] sm:min-h-[60px] rounded-xl flex flex-col items-center justify-center transition-all duration-150 ${
                              isActive
                                ? 'ring-2 ring-indigo-500 bg-indigo-50'
                                : hoveredCell?.empId === employee.id &&
                                  hoveredCell?.date === dateStr
                                ? 'bg-slate-100'
                                : shift
                                ? ''
                                : 'bg-transparent'
                            }`}
                          >
                            {shift ? (
                              /* Un seul bloc couleur : l'horaire doit être sur le même fond que l'abréviation,
                               * sinon textColor (prévu pour fond foncé) tombe sur la zone claire color+33. */
                              <div
                                className={`flex flex-col items-center justify-center gap-0.5 px-2 py-1.5 rounded-xl w-full max-w-[5.5rem] ${
                                  entry && !entry.visibleToEmployee ? 'ring-2 ring-dashed ring-slate-600/45' : ''
                                }`}
                                style={{
                                  backgroundColor: shift.color,
                                  color: shift.textColor,
                                }}
                                title={
                                  entry && !entry.visibleToEmployee
                                    ? 'Brouillon — pas encore visible pour l’employé'
                                    : undefined
                                }
                              >
                                <span className="text-xs font-bold leading-tight">
                                  {shift.shortName}
                                </span>
                                <span className="hidden sm:block text-[10px] font-medium leading-tight opacity-95 text-center">
                                  {(() => {
                                    const disp = getPlannedShiftTimeRange(shift);
                                    const dur = calculateShiftDuration(disp.start, disp.end);
                                    return dur > 0 ? `${disp.start}–${disp.end}` : shift.name;
                                  })()}
                                </span>
                              </div>
                            ) : (
                              <span className="text-slate-200 text-lg group-hover:text-slate-300">
                                +
                              </span>
                            )}

                            {/* Indicateur alerte */}
                            {cellAlerts.length > 0 && (
                              <div className="absolute top-1 right-1 w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
                            )}

                            {/* Indicateur disponibilité employé */}
                            {availDisp && (
                              <span
                                className={`absolute bottom-0.5 left-0.5 leading-none pointer-events-none drop-shadow-[0_0_1px_rgba(255,255,255,0.9)] ${availDisp.className}`}
                                title={availDisp.title}
                              >
                                <AvailabilityStatusIcon
                                  status={availDisp.displayStatus}
                                  size={10}
                                  strokeWidth={2.75}
                                />
                              </span>
                            )}
                          </div>
                        </td>
                      );
                    })}

                    {/* Total heures semaine — caché sur mobile */}
                    <td className="hidden sm:table-cell px-3 py-3 text-center">
                      <div>
                        <p
                          className={`text-sm font-bold ${
                            overHours
                              ? 'text-red-600'
                              : weeklyHours === 0
                              ? 'text-slate-300'
                              : 'text-slate-800'
                          }`}
                        >
                          {formatHours(weeklyHours)}
                        </p>
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          / {employee.contractHours}h
                        </p>
                        {overHours && (
                          <p className="text-[9px] text-red-500 font-medium mt-0.5">Dépassé!</p>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>

            {/* Pied de tableau — totaux (caché sur mobile) */}
            <tfoot className="hidden sm:table-footer-group">
              <tr className="border-t-2 border-slate-200 bg-slate-50">
                <td className="border-r border-slate-200 px-4 py-3">
                  <p className="text-xs font-semibold text-slate-600">Total / jour</p>
                </td>
                {weekDays.map((day) => {
                  const dateStr = format(day, 'yyyy-MM-dd');
                  const dayTotal = displayedEmployees.reduce((sum, emp) => {
                    const entry = scheduleEntries.find(
                      (e) => e.employeeId === emp.id && e.date === dateStr
                    );
                    const shift = entry ? shiftMap.get(entry.shiftId) : null;
                    return sum + (entry && shift ? getPlannedEntryDurationHours(entry, shift) : 0);
                  }, 0);
                  return (
                    <td
                      key={dateStr}
                      className="border-r border-slate-200 px-3 py-3 text-center"
                    >
                      <p className="text-xs font-semibold text-slate-700">
                        {dayTotal > 0 ? formatHours(dayTotal) : '—'}
                      </p>
                    </td>
                  );
                })}
                <td className="px-3 py-3 text-center">
                  <p className="text-sm font-bold text-indigo-600">{formatHours(totalWeekHours)}</p>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Shift Picker */}
      {activeCell && pickerPos && (
        <div
          ref={pickerRef}
          className="fixed z-50"
          style={{ left: pickerPos.x, top: pickerPos.y }}
        >
          <ShiftPicker
            currentShiftId={activeCell_entry?.shiftId}
            onSelect={handleShiftSelect}
            onClear={handleShiftClear}
            employeeName={
              activeEmployee
                ? `${activeEmployee.firstName} ${activeEmployee.lastName}`
                : undefined
            }
            dateLabel={
              activeCell
                ? format(parseISO(activeCell.date), 'EEEE d MMMM', { locale: fr })
                : undefined
            }
          />
        </div>
      )}
    </div>
  );
}
