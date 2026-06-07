'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  LogIn,
  LogOut,
  MapPin,
  MapPinOff,
  Pencil,
  Trash2,
} from 'lucide-react';
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
import { usePlanningStore } from '@/lib/store';
import {
  type TimePunchRow,
  type ApprovedTimeMode,
  PUNCH_STATUS_LABEL,
  ADMIN_ACTION_STATUSES,
  ADMIN_PRIORITY_PUNCH_STATUSES,
  ADMIN_CANCELLABLE_STATUSES,
  getClockedTimes,
  resolveApprovedTimes,
  runAutoCloseStalePunches,
  geofencePunchDisplay,
  adminCanEditPunch,
  syncScheduleFromApproved,
  notifyPointagesReviewUpdated,
} from '@/lib/timePunches';

type ReviewTab = 'action' | 'approved' | 'in_progress';

interface PunchWithEmployee extends TimePunchRow {
  employees: {
    first_name: string;
    last_name: string | null;
    color: string | null;
  } | null;
}

async function clearScheduleValidatedIfAny(
  supabase: ReturnType<typeof createClient>,
  employeeId: string,
  date: string
) {
  await supabase
    .from('schedule_entries')
    .update({
      validated_start: null,
      validated_end: null,
      is_modified: false,
    })
    .eq('employee_id', employeeId)
    .eq('date', date);
}

function initials(first: string, last: string | null) {
  return (first[0] + (last?.[0] ?? '')).toUpperCase();
}

function GeoPunchBadge({
  kind,
  inside,
  compact = false,
}: {
  kind: 'in' | 'out';
  inside: boolean | null | undefined;
  compact?: boolean;
}) {
  const g = geofencePunchDisplay(inside, kind);
  const Icon =
    g.variant === 'inside'
      ? MapPin
      : g.variant === 'outside'
        ? MapPinOff
        : MapPin;

  return (
    <span
      title={g.label}
      className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md border ${g.className}`}
    >
      <Icon className="w-3 h-3 shrink-0" />
      {compact ? g.shortLabel : g.label}
    </span>
  );
}

function GeoSummary({ punch }: { punch: PunchWithEmployee }) {
  const hasOut = Boolean(punch.clock_out_at);

  return (
    <div className="flex flex-wrap gap-1.5">
      <GeoPunchBadge kind="in" inside={punch.clock_in_inside_geofence} />
      {hasOut && (
        <GeoPunchBadge kind="out" inside={punch.clock_out_inside_geofence} />
      )}
      {!hasOut && punch.status === 'in_progress' && (
        <span className="text-[10px] text-slate-400 px-2 py-0.5">Sortie non pointée</span>
      )}
    </div>
  );
}

interface ValidateEditDialogProps {
  punch: PunchWithEmployee | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDone: () => void;
}

function ValidateEditDialog({
  punch,
  open,
  onOpenChange,
  onDone,
}: ValidateEditDialogProps) {
  const [startMode, setStartMode] = useState<ApprovedTimeMode>('actual');
  const [endMode, setEndMode] = useState<ApprovedTimeMode>('actual');
  const [overrideStart, setOverrideStart] = useState('');
  const [overrideEnd, setOverrideEnd] = useState('');
  const [pause15min, setPause15min] = useState(true);
  const [hadSnack, setHadSnack] = useState(false);
  const [ateWorkFood, setAteWorkFood] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const isEdit = punch?.status === 'approved';

  useEffect(() => {
    if (!punch || !open) return;
    const { clockIn, clockOut } = getClockedTimes(punch);
    setStartMode(punch.approved_start_mode ?? 'actual');
    setEndMode(punch.approved_end_mode ?? 'actual');
    setOverrideStart(
      punch.actual_start ?? clockIn ?? punch.planned_start ?? ''
    );
    setOverrideEnd(punch.actual_end ?? clockOut ?? punch.planned_end ?? '');
    setPause15min(punch.pause_15min ?? true);
    setHadSnack(punch.had_snack ?? false);
    setAteWorkFood(punch.ate_work_food ?? false);
  }, [punch, open]);

  const applyStartMode = (mode: ApprovedTimeMode) => {
    if (!punch) return;
    const { clockIn } = getClockedTimes(punch);
    setStartMode(mode);
    setOverrideStart(
      mode === 'planned'
        ? punch.planned_start ?? clockIn ?? ''
        : clockIn ?? punch.planned_start ?? ''
    );
  };

  const applyEndMode = (mode: ApprovedTimeMode) => {
    if (!punch) return;
    const { clockOut } = getClockedTimes(punch);
    setEndMode(mode);
    setOverrideEnd(
      mode === 'planned'
        ? punch.planned_end ?? clockOut ?? ''
        : clockOut ?? punch.planned_end ?? ''
    );
  };

  if (!punch) return null;

  const { clockIn, clockOut } = getClockedTimes(punch);
  const preview = resolveApprovedTimes(punch, startMode, endMode, {
    start: overrideStart || undefined,
    end: overrideEnd || undefined,
  });
  const needsManualEnd =
    punch.status === 'in_progress' || punch.status === 'auto_closed';

  const handleSave = async () => {
    if (!overrideStart || !overrideEnd) {
      toast.error('Heures de début et de fin requises.');
      return;
    }
    setSubmitting(true);
    const supabase = createClient();
    const now = new Date().toISOString();
    const payload: Record<string, unknown> = {
      status: 'approved',
      admin_note: null,
      reviewed_at: now,
      approved_start_mode: startMode,
      approved_end_mode: endMode,
      actual_start: preview.start,
      actual_end: preview.end,
      pause_15min: pause15min,
      had_snack: hadSnack,
      ate_work_food: ateWorkFood,
    };
    if (needsManualEnd && !punch.clock_out_at) {
      payload.clock_out_at = now;
    }

    const { error } = await supabase
      .from('time_declarations')
      .update(payload)
      .eq('id', punch.id);

    if (error) {
      toast.error('Erreur lors de l’enregistrement.');
      setSubmitting(false);
      return;
    }

    await syncScheduleFromApproved(
      supabase,
      punch.employee_id,
      punch.date,
      preview.start,
      preview.end
    );
    void usePlanningStore.getState().loadData({ silent: true });
    toast.success(
      isEdit ? 'Pointage modifié — planning mis à jour' : 'Pointage validé — planning mis à jour'
    );
    setSubmitting(false);
    onOpenChange(false);
    onDone();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(90dvh,calc(100vh-2rem))] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="shrink-0 space-y-1 px-6 pb-3 pt-6 pr-12">
          <DialogTitle>Modifier le pointage</DialogTitle>
          <DialogDescription className="capitalize">
            {format(parseISO(punch.date), 'EEEE d MMMM yyyy', { locale: fr })}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-4">
          <div className="space-y-3 text-sm">
            {punch.auto_closed && (
              <p className="text-xs text-orange-800 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2">
                Clôture automatique après 12 h — vérifiez l’heure de fin.
              </p>
            )}
            {needsManualEnd && !clockOut && (
              <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                Sortie non pointée par l’employé : saisissez l’heure de fin ci-dessous.
              </p>
            )}

            <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3 space-y-2">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">
                Périmètre GPS
              </p>
              <GeoSummary punch={punch} />
            </div>

            {punch.note && (
              <p className="text-xs text-slate-600 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">
                Note employé : {punch.note}
              </p>
            )}

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-slate-50 rounded-xl p-2.5">
                <p className="font-bold text-slate-400 uppercase tracking-wide mb-1">
                  Prévu
                </p>
                <p className="font-semibold text-slate-700">
                  {punch.planned_start ?? '—'} – {punch.planned_end ?? '—'}
                </p>
              </div>
              <div className="bg-slate-50 rounded-xl p-2.5">
                <p className="font-bold text-slate-400 uppercase tracking-wide mb-1">
                  Pointé
                </p>
                <p className="font-semibold text-slate-700">
                  {clockIn ?? '—'} – {clockOut ?? '—'}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-500">Heure d’arrivée</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => applyStartMode('planned')}
                  className={`flex-1 py-2 px-3 rounded-xl border text-xs font-semibold ${
                    startMode === 'planned'
                      ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                      : 'border-slate-200 text-slate-600'
                  }`}
                >
                  Prévu ({punch.planned_start ?? '—'})
                </button>
                <button
                  type="button"
                  onClick={() => applyStartMode('actual')}
                  className={`flex-1 py-2 px-3 rounded-xl border text-xs font-semibold ${
                    startMode === 'actual'
                      ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                      : 'border-slate-200 text-slate-600'
                  }`}
                >
                  Pointé ({clockIn ?? '—'})
                </button>
              </div>
              <input
                type="time"
                value={overrideStart}
                onChange={(e) => setOverrideStart(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
              />
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-500">Heure de départ</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => applyEndMode('planned')}
                  className={`flex-1 py-2 px-3 rounded-xl border text-xs font-semibold ${
                    endMode === 'planned'
                      ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                      : 'border-slate-200 text-slate-600'
                  }`}
                >
                  Prévu ({punch.planned_end ?? '—'})
                </button>
                <button
                  type="button"
                  onClick={() => applyEndMode('actual')}
                  className={`flex-1 py-2 px-3 rounded-xl border text-xs font-semibold ${
                    endMode === 'actual'
                      ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                      : 'border-slate-200 text-slate-600'
                  }`}
                >
                  Pointé ({clockOut ?? '—'})
                </button>
              </div>
              <input
                type="time"
                value={overrideEnd}
                onChange={(e) => setOverrideEnd(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
              />
            </div>

            <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3 space-y-2">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">
                Pause &amp; repas
              </p>
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={pause15min}
                  onChange={(e) => setPause15min(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600"
                />
                <span className="text-sm text-slate-700">Pause 15 min</span>
              </label>
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={hadSnack}
                  onChange={(e) => setHadSnack(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600"
                />
                <span className="text-sm text-slate-700">Collation</span>
              </label>
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={ateWorkFood}
                  onChange={(e) => setAteWorkFood(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600"
                />
                <span className="text-sm text-slate-700">Repas travail</span>
              </label>
            </div>

            <p className="text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2">
              Retenu pour le planning :{' '}
              <strong>
                {preview.start} – {preview.end}
              </strong>
            </p>
          </div>
        </div>

        <DialogFooter className="shrink-0 border-t border-slate-100 bg-white px-6 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button
            className="bg-emerald-600 hover:bg-emerald-700"
            onClick={() => void handleSave()}
            disabled={submitting}
          >
            {submitting
              ? 'Enregistrement…'
              : isEdit
                ? 'Enregistrer'
                : 'Valider'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


interface PunchRowProps {
  punch: PunchWithEmployee;
  onRefresh: () => void;
  onModifyClick: (p: PunchWithEmployee) => void;
  /** En service : pas de modifier/valider, mais annulation possible */
  readOnly?: boolean;
}

function PunchRow({ punch, onRefresh, onModifyClick, readOnly = false }: PunchRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [acting, setActing] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const emp = punch.employees;
  const empName = emp
    ? `${emp.first_name}${emp.last_name ? ' ' + emp.last_name : ''}`
    : '—';
  const empColor = emp?.color ?? '#6366f1';
  const { clockIn, clockOut } = getClockedTimes(punch);

  const displayStart = punch.actual_start ?? clockIn ?? '—';
  const displayEnd = punch.actual_end ?? clockOut ?? '—';

  const geoOutside =
    punch.clock_in_inside_geofence === false ||
    punch.clock_out_inside_geofence === false;

  const canEdit = adminCanEditPunch(punch);
  const isAwaitingReview = ADMIN_ACTION_STATUSES.includes(punch.status);
  const isApproved = punch.status === 'approved';
  const canCancel = ADMIN_CANCELLABLE_STATUSES.includes(punch.status);
  const showActions = !readOnly && canEdit && isAwaitingReview;
  const showCancelInReview = !readOnly && canCancel && isAwaitingReview;
  const showCancelInProgress = readOnly && canCancel;
  const expandable = !isApproved;

  const handleCancelPunch = async () => {
    setCancelling(true);
    const supabase = createClient();
    await clearScheduleValidatedIfAny(supabase, punch.employee_id, punch.date);
    const { error } = await supabase
      .from('time_declarations')
      .delete()
      .eq('id', punch.id);
    setCancelling(false);
    setCancelOpen(false);
    if (error) {
      toast.error('Impossible d’annuler le pointage.');
      return;
    }
    void usePlanningStore.getState().loadData({ silent: true });
    toast.success('Pointage annulé — l’employé peut pointer à nouveau ce jour-là.');
    onRefresh();
  };

  const handleQuickValidate = async () => {
    const { clockIn, clockOut } = getClockedTimes(punch);
    if (!clockIn || !clockOut) {
      toast.error('Heures pointées incomplètes — utilisez Modifier.');
      return;
    }
    setActing(true);
    const supabase = createClient();
    const times = resolveApprovedTimes(punch, 'actual', 'actual');
    const payload: Record<string, unknown> = {
      status: 'approved',
      admin_note: null,
      reviewed_at: new Date().toISOString(),
      approved_start_mode: 'actual',
      approved_end_mode: 'actual',
      actual_start: times.start,
      actual_end: times.end,
    };
    const { error } = await supabase
      .from('time_declarations')
      .update(payload)
      .eq('id', punch.id);
    if (error) {
      toast.error('Erreur lors de la validation.');
      setActing(false);
      return;
    }
    await syncScheduleFromApproved(
      supabase,
      punch.employee_id,
      punch.date,
      times.start,
      times.end
    );
    void usePlanningStore.getState().loadData({ silent: true });
    toast.success('Pointage validé — planning mis à jour');
    setActing(false);
    onRefresh();
  };

  return (
    <div
      className={`rounded-2xl border overflow-hidden bg-white ${
        geoOutside ? 'border-red-200 ring-1 ring-red-50' : 'border-slate-100'
      }`}
    >
      <div
        className={`p-4 flex items-start gap-4 select-none ${
          expandable ? 'cursor-pointer' : 'cursor-default'
        }`}
        onClick={expandable ? () => setExpanded((v) => !v) : undefined}
        role={expandable ? 'button' : undefined}
        tabIndex={expandable ? 0 : undefined}
        onKeyDown={
          expandable
            ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setExpanded((v) => !v);
                }
              }
            : undefined
        }
      >
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center text-white text-[11px] font-bold shrink-0 mt-0.5"
          style={{ backgroundColor: empColor }}
        >
          {emp ? initials(emp.first_name, emp.last_name) : '?'}
        </div>
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-slate-800">{empName}</p>
            <span className="text-xs text-slate-400 capitalize">
              {format(parseISO(punch.date), 'EEE d MMM yyyy', { locale: fr })}
            </span>
            {punch.auto_closed && (
              <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-lg bg-orange-50 text-orange-800 border border-orange-200">
                12 h auto
              </span>
            )}
            <span className="text-[11px] font-semibold text-slate-500">
              {PUNCH_STATUS_LABEL[punch.status]}
            </span>
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-600">
            <LogIn className="w-3 h-3 shrink-0" />
            <span>{clockIn ?? '—'}</span>
            <LogOut className="w-3 h-3 shrink-0 ml-1" />
            <span>{clockOut ?? '—'}</span>
            {punch.status === 'approved' && displayStart !== '—' && (
              <span className="text-slate-400">
                → validé {displayStart}–{displayEnd}
              </span>
            )}
          </div>

          {!isApproved && <GeoSummary punch={punch} />}
        </div>

        {expandable &&
          (expanded ? (
            <ChevronUp className="w-4 h-4 text-slate-400 shrink-0 mt-1" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-400 shrink-0 mt-1" />
          ))}
      </div>

      {expandable && expanded && (
        <div className="border-t border-slate-100 px-4 pb-4 pt-3 space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {(punch.pause_15min ?? true) ? (
              <span className="text-[10px] px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200">
                Pause 15 min
              </span>
            ) : (
              <span className="text-[10px] px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200">
                Pas de pause 15 min
              </span>
            )}
            {punch.had_snack && (
              <span className="text-[10px] px-2 py-0.5 rounded-md bg-white border border-slate-200">
                Collation
              </span>
            )}
            {punch.ate_work_food && (
              <span className="text-[10px] px-2 py-0.5 rounded-md bg-white border border-slate-200">
                Repas travail
              </span>
            )}
          </div>

          {punch.note && (
            <p className="text-xs text-slate-600 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">
              Note employé : {punch.note}
            </p>
          )}

          {punch.admin_note && (
            <p className="text-xs text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              Note admin : {punch.admin_note}
            </p>
          )}

          {showActions && (
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                className="border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                onClick={(e) => {
                  e.stopPropagation();
                  onModifyClick(punch);
                }}
              >
                <Pencil className="w-3.5 h-3.5 mr-1" />
                Modifier
              </Button>
              <Button
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700"
                disabled={acting}
                onClick={(e) => {
                  e.stopPropagation();
                  void handleQuickValidate();
                }}
              >
                <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                Valider
              </Button>
              {showCancelInReview && (
                <Button
                  size="sm"
                  variant="outline"
                  className="border-red-200 text-red-700 hover:bg-red-50"
                  disabled={acting}
                  onClick={(e) => {
                    e.stopPropagation();
                    setCancelOpen(true);
                  }}
                >
                  <Trash2 className="w-3.5 h-3.5 mr-1" />
                  Annuler le pointage
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      {showCancelInProgress && (
        <div className="border-t border-slate-100 px-4 py-3">
          <Button
            size="sm"
            variant="outline"
            className="border-red-200 text-red-700 hover:bg-red-50"
            onClick={() => setCancelOpen(true)}
          >
            <Trash2 className="w-3.5 h-3.5 mr-1" />
            Annuler le pointage
          </Button>
        </div>
      )}

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Annuler ce pointage ?</DialogTitle>
            <DialogDescription>
              Le pointage sera supprimé. L’employé pourra pointer à nouveau ce
              jour-là s’il a travaillé.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOpen(false)}>
              Retour
            </Button>
            <Button
              variant="outline"
              className="border-red-200 text-red-700 hover:bg-red-50"
              disabled={cancelling}
              onClick={() => void handleCancelPunch()}
            >
              {cancelling ? 'Suppression…' : 'Supprimer le pointage'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function PointagesAdminPage() {
  const [punches, setPunches] = useState<PunchWithEmployee[]>([]);
  const [tab, setTab] = useState<ReviewTab>('action');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [editTarget, setEditTarget] = useState<PunchWithEmployee | null>(null);
  const [onlyGeoIssue, setOnlyGeoIssue] = useState(false);

  const fetchAll = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);

    const supabase = createClient();
    await runAutoCloseStalePunches(supabase);

    const selectQuery = `
        id, employee_id, date, planned_start, planned_end,
         clock_in_at, clock_out_at, actual_start, actual_end,
         status, pause_15min, had_snack, ate_work_food, auto_closed,
         admin_note, approved_start_mode, approved_end_mode, reviewed_at, note,
         clock_in_inside_geofence, clock_out_inside_geofence,
         employees ( first_name, last_name, color )`;

    const [{ data: priorityData }, { data: approvedData }] = await Promise.all([
      supabase
        .from('time_declarations')
        .select(selectQuery)
        .in('status', ADMIN_PRIORITY_PUNCH_STATUSES)
        .order('date', { ascending: false }),
      supabase
        .from('time_declarations')
        .select(selectQuery)
        .eq('status', 'approved')
        .order('date', { ascending: false })
        .limit(200),
    ]);

    const merged = new Map<string, Record<string, unknown>>();
    for (const row of [...(priorityData ?? []), ...(approvedData ?? [])]) {
      merged.set((row as { id: string }).id, row as Record<string, unknown>);
    }
    const data = [...merged.values()].sort((a, b) =>
      String(b.date).localeCompare(String(a.date))
    );

    const error = null;

    if (error) console.error(error);
    const rows = (data ?? []).map((row) => {
      const r = row as Record<string, unknown>;
      const emps = r.employees;
      const emp =
        emps && typeof emps === 'object' && !Array.isArray(emps)
          ? (emps as PunchWithEmployee['employees'])
          : Array.isArray(emps) && emps[0]
            ? (emps[0] as PunchWithEmployee['employees'])
            : null;
      return { ...r, employees: emp } as PunchWithEmployee;
    });
    setPunches(rows);
    setLoading(false);
    setRefreshing(false);
    notifyPointagesReviewUpdated();
  }, []);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  const filtered = useMemo(() => {
    let list = punches;
    if (tab === 'action') {
      list = list.filter((p) => ADMIN_ACTION_STATUSES.includes(p.status));
    } else if (tab === 'in_progress') {
      list = list.filter((p) => p.status === 'in_progress');
    } else {
      list = list.filter((p) => p.status === tab);
    }
    if (onlyGeoIssue) {
      list = list.filter(
        (p) =>
          p.clock_in_inside_geofence === false ||
          p.clock_out_inside_geofence === false
      );
    }
    return list;
  }, [punches, tab, onlyGeoIssue]);

  const counts = useMemo(
    () => ({
      action: punches.filter((p) => ADMIN_ACTION_STATUSES.includes(p.status))
        .length,
      in_progress: punches.filter((p) => p.status === 'in_progress').length,
      approved: punches.filter((p) => p.status === 'approved').length,
      geoIssue: punches.filter(
        (p) =>
          p.clock_in_inside_geofence === false ||
          p.clock_out_inside_geofence === false
      ).length,
    }),
    [punches]
  );

  const tabs: { key: ReviewTab; label: string; count: number }[] = [
    { key: 'action', label: 'À traiter', count: counts.action },
    { key: 'in_progress', label: 'En service', count: counts.in_progress },
    { key: 'approved', label: 'Approuvés', count: counts.approved },
  ];

  return (
    <div className="flex flex-col min-h-screen bg-slate-50">
      <Header
        title="Pointages"
        subtitle="Validez les heures pointées ou annulez les erreurs"
      />

      <div className="flex-1 max-w-4xl mx-auto w-full p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-1.5 bg-white border border-slate-100 rounded-2xl p-1.5 shadow-sm flex-wrap">
            {tabs.map(({ key, label, count }) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold transition-all ${
                  tab === key
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-500 hover:bg-slate-50'
                }`}
              >
                {label}
                {count > 0 && (
                  <span
                    className={`h-5 min-w-5 flex items-center justify-center rounded-full px-1.5 text-[10px] font-bold ${
                      tab === key ? 'bg-white/25' : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {count}
                  </span>
                )}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant={onlyGeoIssue ? 'default' : 'outline'}
              size="sm"
              onClick={() => setOnlyGeoIssue((v) => !v)}
              className="gap-1.5"
            >
              <MapPinOff className="w-4 h-4" />
              Hors périmètre
              {counts.geoIssue > 0 && (
                <span className="rounded-full bg-red-100 text-red-700 px-1.5 text-[10px] font-bold">
                  {counts.geoIssue}
                </span>
              )}
            </Button>
            <button
              type="button"
              onClick={() => void fetchAll(true)}
              disabled={refreshing}
              className="h-9 w-9 flex items-center justify-center rounded-xl border border-slate-200 bg-white hover:bg-slate-50"
              title="Rafraîchir"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 rounded-2xl bg-slate-100 animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-slate-400 text-sm">
            Aucun pointage dans cette catégorie.
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((p) => (
              <PunchRow
                key={p.id}
                punch={p}
                readOnly={tab === 'in_progress'}
                onRefresh={() => void fetchAll(true)}
                onModifyClick={setEditTarget}
              />
            ))}
          </div>
        )}
      </div>

      <ValidateEditDialog
        punch={editTarget}
        open={editTarget !== null}
        onOpenChange={(v) => !v && setEditTarget(null)}
        onDone={() => void fetchAll(true)}
      />
    </div>
  );
}
