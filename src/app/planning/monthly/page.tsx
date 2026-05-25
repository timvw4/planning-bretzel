'use client';

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  RotateCcw,
  AlertTriangle,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Eraser,
  ChevronDown,
  Send,
  Filter,
  CalendarRange,
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ShiftPicker } from '@/components/planning/ShiftPicker';
import { PlanningPublicationStatusBar } from '@/components/planning/PlanningPublicationStatusBar';
import { usePlanningStore } from '@/lib/store';
import { useShallow } from 'zustand/react/shallow';
import { getInitials, formatHours, formatDate, calcPickerPosition, getPlannedShiftTimeRange, calculateShiftDuration, availabilityStatusDisplay, availabilityMapKey, getPlannedEntryDurationHours } from '@/lib/utils';
import { getPositionLabel } from '@/lib/employeePosition';

// ── Niveaux de zoom ──────────────────────────────────────────
// Chaque niveau définit la largeur minimale des cellules-jours
// et la hauteur des lignes, ce qui change le rendu du contenu.
const ZOOM_LEVELS = [
  { id: 'xs',  pct: '60%',  cellMinW: 26, rowH: 28,  showTime: false, showName: false },
  { id: 'sm',  pct: '75%',  cellMinW: 36, rowH: 34,  showTime: false, showName: false },
  { id: 'md',  pct: '100%', cellMinW: 52, rowH: 42,  showTime: false, showName: true  },
  { id: 'lg',  pct: '125%', cellMinW: 72, rowH: 56,  showTime: true,  showName: true  },
  { id: 'xl',  pct: '150%', cellMinW: 96, rowH: 68,  showTime: true,  showName: true  },
] as const;

const DEFAULT_ZOOM = 2; // index dans le tableau (100%)

export default function MonthlyPlanningPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const dateParam = searchParams.get('date');

  const {
    employees,
    shifts,
    scheduleEntries,
    assignShift,
    removeShift,
    getMonthlyHours,
    alerts,
    settings,
    publishMonthForEmployees,
    availabilityStatusByKey,
    mergeAvailabilityRequests,
  } = usePlanningStore(
    useShallow((s) => ({
      employees: s.employees,
      shifts: s.shifts,
      scheduleEntries: s.scheduleEntries,
      assignShift: s.assignShift,
      removeShift: s.removeShift,
      getMonthlyHours: s.getMonthlyHours,
      alerts: s.alerts,
      settings: s.settings,
      publishMonthForEmployees: s.publishMonthForEmployees,
      availabilityStatusByKey: s.availabilityStatusByKey,
      mergeAvailabilityRequests: s.mergeAvailabilityRequests,
    }))
  );

  // ── Map des jours fériés : "yyyy-MM-dd" -> nom ───────────────
  const holidayMap = new Map((settings.holidays ?? []).map((h) => [h.date, h.name]));

  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [zoomIdx, setZoomIdx]       = useState(DEFAULT_ZOOM);
  const [activeCell, setActiveCell] = useState<{ empId: string; date: string } | null>(null);
  const [pickerPos,  setPickerPos]  = useState<{ x: number; y: number } | null>(null);
  /** 'all' = tous les employés actifs du mois ; 'subset' = liste dans selectedEmployeeIds */
  const [employeeFilterMode, setEmployeeFilterMode] = useState<'all' | 'subset'>('all');
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([]);
  // ── Mode pinceau : shift sélectionné pour assignation rapide ─
  const [brushShiftId, setBrushShiftId] = useState<string | null>(null);
  const [publishDialogOpen, setPublishDialogOpen] = useState(false);
  const [publishSubmitting, setPublishSubmitting] = useState(false);
  // ── Mode gomme : clic sur une case pour effacer son shift ────
  const [eraseMode, setEraseMode] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  const zoom = ZOOM_LEVELS[zoomIdx];

  const monthStart    = startOfMonth(currentMonth);
  const monthEnd      = endOfMonth(currentMonth);
  const monthKey      = format(currentMonth, 'yyyy-MM');

  // ── Calcul des jours affichés selon le mode ──────────────────
  // 'strict'     : du 1er au dernier jour du mois
  // 'full-weeks' : du lundi de la semaine du 1er au dimanche de la semaine du dernier jour
  const planningMode  = settings.planningMonthMode ?? 'strict';
  const displayStart  = planningMode === 'full-weeks'
    ? startOfWeek(monthStart, { weekStartsOn: 1 })
    : monthStart;
  const displayEnd    = planningMode === 'full-weeks'
    ? endOfWeek(monthEnd, { weekStartsOn: 1 })
    : monthEnd;
  const monthDays     = eachDayOfInterval({ start: displayStart, end: displayEnd });
  const availWindowFrom = format(displayStart, 'yyyy-MM-dd');
  const availWindowTo   = format(displayEnd, 'yyyy-MM-dd');
  // Pour le calcul des heures et des exports, on garde les bornes strictes du mois
  const monthStartStr = format(monthStart, 'yyyy-MM-dd');
  const monthEndStr   = format(monthEnd,   'yyyy-MM-dd');

  // Mémorisé : un simple .filter() recréerait un nouveau tableau à chaque rendu et
  // relancerait en boucle le useEffect qui nettoie selectedEmployeeIds (Maximum update depth).
  const activeEmployees = useMemo(
    () =>
      employees.filter(
        (e) => e.isActive && !(e.inactiveMonths ?? []).includes(monthKey)
      ),
    [employees, monthKey]
  );
  const employeesForFilterMenu = useMemo(
    () =>
      [...activeEmployees].sort((a, b) =>
        a.firstName.localeCompare(b.firstName, 'fr', { sensitivity: 'base' })
      ),
    [activeEmployees]
  );

  const displayedEmployees = useMemo(() => {
    if (employeeFilterMode === 'all') return activeEmployees;
    return activeEmployees.filter((e) => new Set(selectedEmployeeIds).has(e.id));
  }, [employeeFilterMode, selectedEmployeeIds, activeEmployees]);

  const filterSummaryTitle = useMemo(() => {
    const list =
      employeeFilterMode === 'all'
        ? activeEmployees
        : activeEmployees.filter((e) => selectedEmployeeIds.includes(e.id));
    return list
      .map((e) => `${e.firstName}${e.lastName ? ` ${e.lastName}` : ''}`.trim())
      .join(', ');
  }, [employeeFilterMode, selectedEmployeeIds, activeEmployees]);

  const filterSummaryLabel = useMemo(() => {
    const n = activeEmployees.length;
    if (n === 0) return 'Aucun employé actif';
    if (employeeFilterMode === 'all') return `Tous les employés (${n})`;
    const k = selectedEmployeeIds.length;
    if (k === 0) return 'Aucun employé';
    if (k === 1) {
      const e = activeEmployees.find((x) => x.id === selectedEmployeeIds[0]);
      return e
        ? `${e.firstName}${e.lastName ? ` ${e.lastName}` : ''}`.trim()
        : '1 employé';
    }
    return `${k} employés`;
  }, [employeeFilterMode, selectedEmployeeIds, activeEmployees]);

  /** Résumé complet pour l’info-bulle du bouton Filtre */
  const unifiedFilterTitle = filterSummaryTitle || filterSummaryLabel;

  const hasActiveFilters = employeeFilterMode === 'subset';

  useEffect(() => {
    if (!dateParam) return;
    const parsed = parseISO(dateParam);
    if (!Number.isNaN(parsed.getTime())) setCurrentMonth(parsed);
  }, [dateParam]);

  useEffect(() => {
    void mergeAvailabilityRequests(availWindowFrom, availWindowTo);
  }, [availWindowFrom, availWindowTo, mergeAvailabilityRequests]);

  useEffect(() => {
    if (employeeFilterMode !== 'subset') return;
    const valid = new Set(activeEmployees.map((e) => e.id));
    setSelectedEmployeeIds((prev) => {
      const pruned = prev.filter((id) => valid.has(id));
      if (
        pruned.length === activeEmployees.length &&
        activeEmployees.length > 0 &&
        activeEmployees.every((e) => pruned.includes(e.id))
      ) {
        queueMicrotask(() => setEmployeeFilterMode('all'));
        return [];
      }
      return pruned;
    });
  }, [activeEmployees, monthKey, employeeFilterMode]);

  const areAllEmployeesSelected =
    employeeFilterMode === 'all' ||
    (activeEmployees.length > 0 &&
      activeEmployees.every((e) => selectedEmployeeIds.includes(e.id)));

  const isEmployeeRowChecked = (id: string) =>
    areAllEmployeesSelected || selectedEmployeeIds.includes(id);

  const handleToggleAllEmployees = () => {
    if (areAllEmployeesSelected) {
      setEmployeeFilterMode('subset');
      setSelectedEmployeeIds([]);
    } else {
      setEmployeeFilterMode('all');
      setSelectedEmployeeIds([]);
    }
  };

  const handleToggleOneEmployee = (id: string, checked: boolean) => {
    if (areAllEmployeesSelected) {
      if (!checked) {
        setEmployeeFilterMode('subset');
        setSelectedEmployeeIds(activeEmployees.map((e) => e.id).filter((x) => x !== id));
      }
      return;
    }
    if (checked) {
      const next = Array.from(new Set([...selectedEmployeeIds, id]));
      if (next.length === activeEmployees.length) {
        setEmployeeFilterMode('all');
        setSelectedEmployeeIds([]);
      } else {
        setSelectedEmployeeIds(next);
      }
    } else {
      setEmployeeFilterMode('subset');
      setSelectedEmployeeIds(selectedEmployeeIds.filter((x) => x !== id));
    }
  };

  const shiftMap = new Map(shifts.map((s) => [s.id, s]));

  // ── Fermer picker si clic extérieur ─────────────────────────
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setActiveCell(null);
        setPickerPos(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── Echap pour quitter pinceau / gomme ───────────────────────
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

  // ── Zoom clavier Ctrl + molette ──────────────────────────────
  useEffect(() => {
    const handler = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      setZoomIdx((prev) =>
        e.deltaY < 0
          ? Math.min(prev + 1, ZOOM_LEVELS.length - 1)
          : Math.max(prev - 1, 0)
      );
    };
    window.addEventListener('wheel', handler, { passive: false });
    return () => window.removeEventListener('wheel', handler);
  }, []);

  // ── Clic sur une cellule ─────────────────────────────────────
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

      // Mode normal : ouvrir le picker
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      if (activeCell?.empId === empId && activeCell?.date === date) {
        setActiveCell(null); setPickerPos(null);
      } else {
        setActiveCell({ empId, date }); setPickerPos(calcPickerPosition(rect));
      }
    },
    [activeCell, brushShiftId, eraseMode, scheduleEntries, assignShift, removeShift]
  );

  const handleShiftSelect = (shiftId: string) => {
    if (!activeCell) return;
    assignShift(activeCell.empId, activeCell.date, shiftId);
    const shift = shiftMap.get(shiftId);
    toast.success(`Shift "${shift?.name}" assigné`);
    setActiveCell(null); setPickerPos(null);
  };

  const handleShiftClear = () => {
    if (!activeCell) return;
    removeShift(activeCell.empId, activeCell.date);
    toast.success('Assignation supprimée');
    setActiveCell(null); setPickerPos(null);
  };

  // ── Sélectionner / désélectionner un shift pinceau ──────────
  const handleBrushSelect = (shiftId: string) => {
    setBrushShiftId((prev) => (prev === shiftId ? null : shiftId));
    setEraseMode(false);
    setActiveCell(null);
    setPickerPos(null);
  };

  // ── Activer / désactiver la gomme ────────────────────────────
  const handleEraseToggle = () => {
    setEraseMode((prev) => !prev);
    setBrushShiftId(null);
    setActiveCell(null);
    setPickerPos(null);
  };

  const brushShift = brushShiftId ? shiftMap.get(brushShiftId) : null;

  const activeCellEntry = activeCell
    ? scheduleEntries.find((e) => e.employeeId === activeCell.empId && e.date === activeCell.date)
    : null;
  const activeEmployee = activeCell ? employees.find((e) => e.id === activeCell.empId) : null;

  const getCellAlerts = (empId: string, date: string) =>
    alerts.filter((a) => !a.resolved && a.employeeId === empId && a.date === date);

  // ── Exports ──────────────────────────────────────────────────
  // En mode "semaines complètes", on passe les bornes d'affichage étendues
  // et on fournit monthStartStr comme référence pour le titre et les inactifs.
  const exportStartStr = format(displayStart, 'yyyy-MM-dd');
  const exportEndStr   = format(displayEnd,   'yyyy-MM-dd');

  const handleExportExcel = async () => {
    const { exportToExcel } = await import('@/lib/export');
    await exportToExcel(
      displayedEmployees,
      shifts,
      scheduleEntries,
      exportStartStr,
      exportEndStr,
      settings.companyName,
      monthStartStr
    );
    toast.success('Planning exporté en Excel');
  };
  const handleExportPDF = async () => {
    const { exportToPDF } = await import('@/lib/export');
    await exportToPDF(
      displayedEmployees,
      shifts,
      scheduleEntries,
      exportStartStr,
      exportEndStr,
      settings.companyName,
      monthStartStr,
      settings.holidays ?? []
    );
    toast.success('PDF téléchargé — vérifiez votre dossier Téléchargements');
  };

  const handleConfirmPublishMonth = async () => {
    setPublishSubmitting(true);
    try {
      await publishMonthForEmployees(monthKey);
      toast.success(
        `Le planning de ${format(currentMonth, 'MMMM yyyy', { locale: fr })} est maintenant visible pour les employés.`
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

  // ── Colonne employé : largeur adaptée au zoom ───────────────
  const empColW = zoom.id === 'xs' ? 100 : zoom.id === 'sm' ? 120 : 152;

  const totalMonthHours = displayedEmployees.reduce(
    (sum, emp) => sum + getMonthlyHours(emp.id, monthStartStr, monthEndStr),
    0
  );

  return (
    <div className="animate-fade-in flex flex-col h-screen">
      {/* ── En-tête ─────────────────────────────────────────── */}
      <Header
        title="Planning prévu"
        actions={
          <div className="flex items-center gap-2">
            {/* Filtre groupes + employés */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 min-w-[7rem] justify-between gap-2 font-normal px-3"
                  title={unifiedFilterTitle || undefined}
                  disabled={activeEmployees.length === 0}
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <Filter className="h-4 w-4 shrink-0 text-slate-500" />
                    <span className="text-sm text-slate-700">Filtre</span>
                    {hasActiveFilters && (
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0" aria-hidden />
                    )}
                  </span>
                  <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-80 max-h-[min(24rem,70vh)] overflow-y-auto">
                <DropdownMenuLabel className="text-xs font-semibold text-slate-500">
                  Employés affichés
                </DropdownMenuLabel>
                <DropdownMenuCheckboxItem
                  checked={areAllEmployeesSelected}
                  onCheckedChange={handleToggleAllEmployees}
                  onSelect={(e) => e.preventDefault()}
                >
                  Tous les employés ({activeEmployees.length})
                </DropdownMenuCheckboxItem>
                <DropdownMenuSeparator />
                {employeesForFilterMenu.map((e) => (
                  <DropdownMenuCheckboxItem
                    key={e.id}
                    checked={isEmployeeRowChecked(e.id)}
                    onCheckedChange={(c) => handleToggleOneEmployee(e.id, c === true)}
                    onSelect={(ev) => ev.preventDefault()}
                  >
                    <span className="flex items-center gap-2 min-w-0 flex-1">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0 ring-1 ring-black/5"
                        style={{ backgroundColor: e.color }}
                      />
                      <span className="truncate">
                        {e.firstName}
                        {e.lastName ? ` ${e.lastName}` : ''}
                      </span>
                      <span className="text-[10px] text-slate-400 ml-auto shrink-0 tabular-nums">
                        {getInitials(e.firstName, e.lastName)}
                      </span>
                    </span>
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <Button
              variant="default"
              size="sm"
              className="h-9 gap-1.5 bg-emerald-600 hover:bg-emerald-700"
              onClick={() => setPublishDialogOpen(true)}
            >
              <Send className="h-4 w-4" />
              Envoyer le mois
            </Button>

            {/* Exports */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5">
                  <Download className="h-4 w-4" />
                  
                  <ChevronDown className="h-3.5 w-3.5 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Format</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => void handleExportExcel()}>
                  Excel
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => void handleExportPDF()}>
                  PDF
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        }
      />

      <Dialog open={publishDialogOpen} onOpenChange={setPublishDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Envoyer le mois aux employés ?</DialogTitle>
            <DialogDescription asChild>
              <div className="text-sm text-slate-600 space-y-2 pt-1">
                <p>
                  Tous les créneaux du mois de{' '}
                  <strong>{format(currentMonth, 'MMMM yyyy', { locale: fr })}</strong> deviendront visibles sur le
                  compte employé (planning du mois affiché).
                </p>
                <p className="text-xs text-slate-500">
                  Jusqu&apos;ici, les shifts que vous posez restent en <strong>brouillon</strong> (cadre en pointillés
                  sur la grille). Après envoi, les employés les voient.
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
              onClick={() => void handleConfirmPublishMonth()}
              disabled={publishSubmitting}
            >
              {publishSubmitting ? 'Envoi…' : "Confirmer l'envoi"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="flex-1 overflow-hidden flex flex-col">
        {/* ── Barre de navigation ────────────────────────────── */}
        <div className="bg-white border-b border-slate-100">
          {/* Ligne 1 : navigation mois + zoom */}
          <div className="flex items-center justify-between px-6 py-2.5 gap-4">
            {/* Navigation mois */}
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" onClick={() => setCurrentMonth((m) => subMonths(m, 1))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <button
                className="text-sm font-semibold text-slate-900 capitalize min-w-[140px] text-center hover:text-indigo-600 transition-colors px-2"
                onClick={() => setCurrentMonth(new Date())}
              >
                {format(currentMonth, 'MMMM yyyy', { locale: fr })}
              </button>
              <Button variant="ghost" size="icon" onClick={() => setCurrentMonth((m) => addMonths(m, 1))}>
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setCurrentMonth(new Date())} className="text-xs text-slate-500 ml-1">
                <RotateCcw className="h-3.5 w-3.5" /> Aujourd'hui
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  router.push(`/planning/weekly?date=${format(currentMonth, 'yyyy-MM-dd')}`)
                }
                className="text-xs ml-2 gap-1.5"
              >
                <CalendarRange className="h-3.5 w-3.5" />
                Vue hebdomadaire
              </Button>
            </div>

            {/* Contrôles zoom */}
            <div className="flex items-center gap-1 shrink-0">
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setZoomIdx((z) => Math.max(z - 1, 0))}
                disabled={zoomIdx === 0}
                title="Dézoomer (Ctrl+Scroll)"
              >
                <ZoomOut className="h-4 w-4" />
              </Button>
              <div className="flex items-center gap-1 px-1">
                {ZOOM_LEVELS.map((z, i) => (
                  <button
                    key={z.id}
                    onClick={() => setZoomIdx(i)}
                    className={`transition-all duration-150 rounded-full ${
                      i === zoomIdx
                        ? 'w-5 h-2 bg-indigo-600'
                        : 'w-2 h-2 bg-slate-200 hover:bg-slate-300'
                    }`}
                    title={z.pct}
                  />
                ))}
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setZoomIdx((z) => Math.min(z + 1, ZOOM_LEVELS.length - 1))}
                disabled={zoomIdx === ZOOM_LEVELS.length - 1}
                title="Zoomer (Ctrl+Scroll)"
              >
                <ZoomIn className="h-4 w-4" />
              </Button>
              <span className="text-[11px] text-slate-400 font-medium w-9 text-center">
                {zoom.pct}
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setZoomIdx(DEFAULT_ZOOM)}
                title="Réinitialiser le zoom"
              >
                <Maximize2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          <PlanningPublicationStatusBar
            periodStart={monthStartStr}
            periodEnd={monthEndStr}
            scheduleEntries={scheduleEntries}
            periodLabel={format(currentMonth, 'MMMM yyyy', { locale: fr })}
          />

          {/* Ligne 2 : légende shifts + pinceau + gomme */}
          <div className="flex items-center gap-2 px-6 pb-2.5 flex-wrap">
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
              <span className={`ml-1 text-[10px] font-semibold border rounded-lg px-2 py-1 flex items-center gap-1 shrink-0 ${
                eraseMode
                  ? 'text-red-600 bg-red-50 border-red-200'
                  : 'text-indigo-600 bg-indigo-50 border-indigo-200'
              }`}>
                {eraseMode ? '🧹 Gomme active' : '🖌 Pinceau actif'} — Échap pour quitter
              </span>
            )}
          </div>
        </div>

        {/* ── Tableau ─────────────────────────────────────────── */}
        <div className="flex-1 overflow-auto bg-slate-50">
          <table
            className="border-collapse"
            style={{ tableLayout: 'fixed', width: '100%', cursor: brushShiftId ? 'crosshair' : eraseMode ? 'cell' : 'default' }}
          >
            {/* ── En-têtes colonnes ─────────────────────────── */}
            <thead className="sticky top-0 z-20 bg-white shadow-sm">
              <tr>
                {/* Colonne employé (sticky left) */}
                <th
                  className="sticky left-0 z-30 bg-white border-b border-r border-slate-200 text-left px-3 py-2 shadow-[2px_0_4px_rgba(0,0,0,0.04)]"
                  style={{ width: empColW, minWidth: empColW }}
                >
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">
                    Employé
                  </span>
                </th>

                {/* Jours */}
                {monthDays.map((day) => {
                  const dow         = getDay(day);
                  const isWE        = dow === 0 || dow === 6;
                  const isTd        = isToday(day);
                  const dateStr     = format(day, 'yyyy-MM-dd');
                  const isHoliday   = holidayMap.has(dateStr);
                  const holidayName = holidayMap.get(dateStr);
                  const isCurrentMonth = isSameMonth(day, currentMonth);
                  const dayLabel    = format(day, 'EEE', { locale: fr });

                  return (
                    <th
                      key={day.toISOString()}
                      title={isHoliday ? holidayName : undefined}
                      className={`border-b border-r border-slate-200 text-center select-none transition-colors ${
                        !isCurrentMonth
                          ? 'bg-slate-50/80'
                          : isTd
                          ? 'bg-indigo-50 border-b-2 border-b-indigo-400'
                          : isHoliday
                          ? 'bg-amber-50 border-b-2 border-b-amber-300'
                          : isWE
                          ? 'bg-slate-100/70'
                          : 'bg-white'
                      }`}
                      style={{ minWidth: zoom.cellMinW, width: zoom.cellMinW }}
                    >
                      <div className="flex flex-col items-center justify-center py-1.5 gap-0.5">
                        {/* Abréviation jour */}
                        {zoom.cellMinW >= 36 && (
                          <span
                            className={`text-[9px] font-semibold uppercase tracking-widest leading-none ${
                              !isCurrentMonth ? 'text-slate-300'
                              : isTd ? 'text-indigo-500'
                              : isHoliday ? 'text-amber-500'
                              : 'text-slate-400'
                            }`}
                          >
                            {dayLabel.slice(0, zoom.cellMinW >= 52 ? 3 : 1)}
                          </span>
                        )}
                        {/* Numéro */}
                        <div
                          className={`font-bold leading-none flex items-center justify-center rounded-full transition-all ${
                            zoom.cellMinW >= 52
                              ? 'w-6 h-6 text-xs'
                              : zoom.cellMinW >= 36
                              ? 'w-5 h-5 text-[10px]'
                              : 'w-4 h-4 text-[9px]'
                          } ${
                            !isCurrentMonth
                              ? 'text-slate-300'
                              : isTd
                              ? 'bg-indigo-600 text-white shadow-sm'
                              : isHoliday
                              ? 'bg-amber-400 text-white shadow-sm'
                              : isWE
                              ? 'text-slate-400'
                              : 'text-slate-700'
                          }`}
                        >
                          {day.getDate()}
                        </div>
                        {/* Indicateur férié (zoom suffisant, dans le mois) */}
                        {isHoliday && isCurrentMonth && zoom.cellMinW >= 52 && (
                          <span className="text-[8px] leading-none text-amber-500 font-medium truncate max-w-full px-0.5 text-center">
                            {holidayName && holidayName.length > 6 ? holidayName.slice(0, 5) + '…' : holidayName}
                          </span>
                        )}
                      </div>
                    </th>
                  );
                })}

                {/* Colonne total */}
                <th
                  className="bg-white border-b border-slate-200 text-center px-2 py-2"
                  style={{ minWidth: 52, width: 52 }}
                >
                  <span className="text-[9px] font-semibold text-slate-400 uppercase tracking-widest">
                    Total
                  </span>
                </th>
              </tr>
            </thead>

            {/* ── Corps du tableau ───────────────────────────── */}
            <tbody>
              {displayedEmployees.map((employee, empIdx) => {
                const monthlyHours = getMonthlyHours(employee.id, monthStartStr, monthEndStr);
                const overHours    = monthlyHours > employee.contractHours * 4.33;
                const empAlerts    = alerts.filter((a) => !a.resolved && a.employeeId === employee.id);
                const isEven       = empIdx % 2 === 0;

                return (
                  <tr
                    key={employee.id}
                    className={`group/row border-b border-slate-100 hover:brightness-[0.98] transition-all ${
                      isEven ? 'bg-white' : 'bg-slate-50/60'
                    }`}
                    style={{ height: zoom.rowH }}
                  >
                    {/* ── Cellule employé (sticky) ────────────── */}
                    <td
                      className="sticky left-0 z-10 border-r border-slate-200 px-2.5 shadow-[2px_0_4px_rgba(0,0,0,0.04)]"
                      style={{
                        backgroundColor: isEven ? '#ffffff' : '#f8fafc',
                        width: empColW,
                        minWidth: empColW,
                      }}
                    >
                      <div className="flex items-center gap-2">
                        {/* Avatar coloré */}
                        <div
                          className={`shrink-0 flex items-center justify-center font-bold text-white rounded-lg ${
                            zoom.id === 'xs' ? 'w-5 h-5 text-[8px]' : 'w-7 h-7 text-[10px]'
                          }`}
                          style={{ backgroundColor: employee.color }}
                        >
                          {getInitials(employee.firstName, employee.lastName)}
                        </div>

                        {/* Nom (masqué si très petit) */}
                        {zoom.showName && (
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold text-slate-800 truncate leading-tight">
                              {employee.firstName}
                              {employee.lastName ? ` ${employee.lastName}` : ''}
                            </p>
                            {zoom.cellMinW >= 52 && (
                              <p className="text-[9px] text-slate-400 truncate leading-tight">
                                {getPositionLabel(employee.position)}
                              </p>
                            )}
                          </div>
                        )}

                        {/* Icône alerte */}
                        {empAlerts.length > 0 && zoom.cellMinW >= 36 && (
                          <AlertTriangle className="h-3 w-3 text-amber-400 shrink-0" />
                        )}
                      </div>
                    </td>

                    {/* ── Cellules par jour ───────────────────── */}
                    {monthDays.map((day) => {
                      const dateStr   = format(day, 'yyyy-MM-dd');
                      const entry     = scheduleEntries.find(
                        (e) => e.employeeId === employee.id && e.date === dateStr
                      );
                      const shift          = entry ? shiftMap.get(entry.shiftId) : null;
                      const displayTimes   = shift ? getPlannedShiftTimeRange(shift) : { start: '', end: '' };
                      const showValidatedTime =
                        Boolean(shift && zoom.showTime && calculateShiftDuration(displayTimes.start, displayTimes.end) > 0);
                      const dow            = getDay(day);
                      const isWE           = dow === 0 || dow === 6;
                      const isTd           = isToday(day);
                      const isHolidayCell  = holidayMap.has(dateStr);
                      const isCurrentMonth = isSameMonth(day, currentMonth);
                      const isActive       = activeCell?.empId === employee.id && activeCell?.date === dateStr;
                      const cellAlerts     = getCellAlerts(employee.id, dateStr);
                      const availDisp      = availabilityStatusDisplay(
                        availabilityStatusByKey[availabilityMapKey(employee.id, dateStr)]
                      );

                      return (
                        <td
                          key={dateStr}
                          onClick={(e) => handleCellClick(employee.id, dateStr, e)}
                          className={`border-r border-slate-100 p-0.5 cursor-pointer select-none transition-colors ${
                            !isCurrentMonth && !shift
                              ? 'bg-slate-50/80'
                              : isHolidayCell && !shift
                              ? 'bg-amber-50/60'
                              : isWE && !shift
                              ? 'bg-slate-100/40'
                              : ''
                          } ${isTd && !shift ? 'bg-indigo-50/40' : ''}`}
                          style={{ width: zoom.cellMinW, minWidth: zoom.cellMinW }}
                        >
                          <div
                            className={`relative w-full h-full rounded-md flex flex-col items-center justify-center overflow-hidden transition-all duration-100 ${
                              isActive
                                ? 'ring-2 ring-indigo-500 ring-inset'
                                : !shift
                                ? 'hover:bg-slate-200/60 group-hover/row:bg-slate-100/50'
                                : 'hover:brightness-95'
                            } ${
                              shift && entry && !entry.visibleToEmployee
                                ? 'ring-2 ring-dashed ring-slate-500/55 ring-inset'
                                : ''
                            }`}
                            title={
                              shift && entry && !entry.visibleToEmployee
                                ? 'Brouillon — pas encore visible pour l’employé'
                                : undefined
                            }
                            style={{
                              height: zoom.rowH - 6,
                              backgroundColor: shift ? shift.color : undefined,
                            }}
                          >
                            {shift ? (
                              <>
                                {/* Badge shift */}
                                <span
                                  className="font-bold leading-none"
                                  style={{
                                    color: shift.textColor,
                                    fontSize:
                                      zoom.cellMinW >= 72
                                        ? '11px'
                                        : zoom.cellMinW >= 52
                                        ? '10px'
                                        : '8px',
                                  }}
                                >
                                  {shift.shortName}
                                </span>

                                {/* Heure de début–fin (si zoom lg/xl) — horaires prévus du shift */}
                                {showValidatedTime && (
                                  <span
                                    className="leading-none mt-0.5 opacity-80"
                                    style={{ color: shift.textColor, fontSize: '9px' }}
                                  >
                                    {displayTimes.start}–{displayTimes.end}
                                  </span>
                                )}
                              </>
                            ) : (
                              /* Cellule vide — "+" discret au survol */
                              <span className="text-slate-300 opacity-0 group-hover/row:opacity-60 text-xs">
                                +
                              </span>
                            )}

                            {/* Pastille alerte */}
                            {cellAlerts.length > 0 && (
                              <div className="absolute top-0.5 right-0.5 w-1.5 h-1.5 bg-amber-500 rounded-full" />
                            )}

                            {/* Indicateur disponibilité employé (★ / ✓ / ✗) — masqué au zoom minimal */}
                            {availDisp && zoom.id !== 'xs' && (
                              <span
                                className={`absolute bottom-0.5 left-0.5 leading-none font-bold pointer-events-none drop-shadow-[0_0_1px_rgba(255,255,255,0.9)] ${availDisp.className} ${
                                  zoom.cellMinW >= 52 ? 'text-[10px]' : 'text-[8px]'
                                }`}
                                title={availDisp.title}
                              >
                                {availDisp.symbol}
                              </span>
                            )}
                          </div>
                        </td>
                      );
                    })}

                    {/* ── Total heures du mois ────────────────── */}
                    <td className="text-center px-1" style={{ width: 52, minWidth: 52 }}>
                      <span
                        className={`font-semibold leading-none ${
                          zoom.cellMinW >= 52 ? 'text-xs' : 'text-[9px]'
                        } ${
                          overHours
                            ? 'text-red-500'
                            : monthlyHours === 0
                            ? 'text-slate-300'
                            : 'text-slate-600'
                        }`}
                      >
                        {monthlyHours > 0 ? formatHours(monthlyHours) : '—'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>

            {/* ── Pied de tableau — totaux par jour ─────────── */}
            <tfoot>
              <tr className="border-t-2 border-slate-200 bg-slate-50">
                <td
                  className="sticky left-0 z-10 bg-slate-50 border-r border-slate-200 px-3 py-2 shadow-[2px_0_4px_rgba(0,0,0,0.04)]"
                  style={{ width: empColW, minWidth: empColW }}
                >
                  <p
                    className={`font-semibold text-slate-600 leading-none ${
                      zoom.cellMinW >= 52 ? 'text-xs' : 'text-[10px]'
                    }`}
                  >
                    Total / jour
                  </p>
                </td>
                {monthDays.map((day) => {
                  const dateStr = format(day, 'yyyy-MM-dd');
                  const isCurrentMonth = isSameMonth(day, currentMonth);
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
                      className={`border-r border-slate-200 px-1 py-2 text-center ${
                        !isCurrentMonth ? 'opacity-50' : ''
                      }`}
                      style={{ minWidth: zoom.cellMinW, width: zoom.cellMinW }}
                    >
                      <span
                        className={`font-semibold leading-none ${
                          zoom.cellMinW >= 52 ? 'text-[10px]' : 'text-[9px]'
                        } ${dayTotal > 0 ? 'text-slate-700' : 'text-slate-300'}`}
                      >
                        {dayTotal > 0 ? formatHours(dayTotal) : '—'}
                      </span>
                    </td>
                  );
                })}
                <td className="text-center px-1 py-2" style={{ width: 52, minWidth: 52 }}>
                  <span
                    className={`font-bold text-indigo-600 leading-none ${
                      zoom.cellMinW >= 52 ? 'text-xs' : 'text-[9px]'
                    }`}
                  >
                    {totalMonthHours > 0 ? formatHours(totalMonthHours) : '—'}
                  </span>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* ── Pied de page : total global + astuce zoom ─────── */}
        <div className="flex items-center justify-between px-6 py-2 bg-white border-t border-slate-100 text-xs text-slate-400">
          <span>
            {displayedEmployees.length} employé{displayedEmployees.length > 1 ? 's' : ''} ·{' '}
            {monthDays.length} jours
          </span>
          <span className="italic">Ctrl + molette pour zoomer</span>
        </div>
      </div>

      {/* ── Shift Picker (popup) ─────────────────────────────── */}
      {activeCell && pickerPos && (
        <div
          ref={pickerRef}
          className="fixed z-50"
          style={{ left: pickerPos.x, top: pickerPos.y }}
        >
          <ShiftPicker
            currentShiftId={activeCellEntry?.shiftId}
            onSelect={handleShiftSelect}
            onClear={handleShiftClear}
            employeeName={
              activeEmployee
                ? `${activeEmployee.firstName}${activeEmployee.lastName ? ' ' + activeEmployee.lastName : ''}`
                : undefined
            }
            dateLabel={
              activeCell ? formatDate(activeCell.date, 'EEEE d MMMM') : undefined
            }
          />
        </div>
      )}
    </div>
  );
}
