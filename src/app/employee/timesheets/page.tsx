'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { format, parseISO, subDays } from 'date-fns';
import { fr } from 'date-fns/locale';
import {
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  LogIn,
  LogOut,
  Coffee,
  UtensilsCrossed,
  Loader2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import type { WorkSiteGeofence } from '@/lib/types';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  type TimePunchRow,
  type PunchStatus,
  isDeclarableWorkShift,
  resolvePunchGeolocation,
  normalizePunchGeoResult,
  loadWorkSiteFence,
  runAutoCloseStalePunches,
  getClockedTimes,
  timestampToHHMM,
  PUNCH_STATUS_LABEL,
} from '@/lib/timePunches';
import { legalBreakMinutes } from '@/lib/swissBreaks';
import { BreakMinutesField } from '@/components/planning/BreakMinutesField';

interface ShiftInfo {
  name: string;
  shortName: string;
  startTime: string;
  endTime: string;
  color: string;
  textColor: string;
}

interface DayContext {
  date: string;
  shift: ShiftInfo | null;
  punch: TimePunchRow | null;
}

const STATUS_STYLE: Record<
  PunchStatus,
  { pill: string; icon: React.ElementType }
> = {
  in_progress: {
    pill: 'bg-blue-50 border border-blue-200 text-blue-700',
    icon: Clock,
  },
  pending: {
    pill: 'bg-amber-50 border border-amber-200 text-amber-700',
    icon: Clock,
  },
  approved: {
    pill: 'bg-green-50 border border-green-200 text-green-700',
    icon: CheckCircle2,
  },
  rejected: {
    pill: 'bg-red-50 border border-red-200 text-red-600',
    icon: XCircle,
  },
  auto_closed: {
    pill: 'bg-orange-50 border border-orange-200 text-orange-800',
    icon: AlertCircle,
  },
};

const RECENT_DAYS_LOOKBACK = 7;

function PageSkeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      <div className="h-32 rounded-2xl bg-slate-100" />
      <div className="h-20 rounded-2xl bg-slate-100" />
      <div className="h-20 rounded-2xl bg-slate-100" />
    </div>
  );
}

export default function EmployeeTimesheetsPage() {
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [workSiteFence, setWorkSiteFence] = useState<WorkSiteGeofence | null>(null);
  const [todayCtx, setTodayCtx] = useState<DayContext | null>(null);
  const [recentDays, setRecentDays] = useState<DayContext[]>([]);
  const [loading, setLoading] = useState(true);
  const [clockInLoading, setClockInLoading] = useState(false);
  const [clockOutLoading, setClockOutLoading] = useState(false);
  const [outDialogOpen, setOutDialogOpen] = useState(false);
  const [pauseMinutes, setPauseMinutes] = useState(0);
  /** Durée travaillée au moment d'ouvrir la fenêtre de fin de service. */
  const [outWorkedHours, setOutWorkedHours] = useState(0);
  const [hadSnack, setHadSnack] = useState(false);
  const [ateWorkFood, setAteWorkFood] = useState(false);
  const [note, setNote] = useState('');

  const todayStr = format(new Date(), 'yyyy-MM-dd');

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const { data: profile } = await supabase
        .from('profiles')
        .select('employee_id')
        .eq('id', data.user.id)
        .single();
      setEmployeeId(profile?.employee_id ?? null);
    });
  }, []);

  const loadData = useCallback(async () => {
    if (!employeeId) return;
    const supabase = createClient();

    await runAutoCloseStalePunches(supabase, employeeId);

    const fence = await loadWorkSiteFence(supabase);
    setWorkSiteFence(fence);

    const dates = [
      todayStr,
      ...Array.from({ length: RECENT_DAYS_LOOKBACK }, (_, i) =>
        format(subDays(new Date(), i + 1), 'yyyy-MM-dd')
      ),
    ];
    const from = dates[dates.length - 1]!;
    const to = dates[0]!;

    const [{ data: scheduleData }, { data: punchData }] = await Promise.all([
      supabase
        .from('schedule_entries')
        .select(
          'date, validated_start, validated_end, shifts (name, short_name, start_time, end_time, color, text_color, type)'
        )
        .eq('employee_id', employeeId)
        .eq('visible_to_employee', true)
        .gte('date', from)
        .lte('date', to),
      supabase
        .from('time_declarations')
        .select(
          'id, employee_id, date, planned_start, planned_end, clock_in_at, clock_out_at, actual_start, actual_end, status, pause_15min, pause_minutes, had_snack, ate_work_food, auto_closed, admin_note, approved_start_mode, approved_end_mode, note'
        )
        .eq('employee_id', employeeId)
        .gte('date', from)
        .lte('date', to),
    ]);

    const shiftByDate = new Map<string, ShiftInfo>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const row of scheduleData ?? ([] as any[])) {
      const sh = row.shifts;
      if (!sh || !isDeclarableWorkShift(sh)) continue;
      shiftByDate.set(row.date, {
        name: sh.name,
        shortName: sh.short_name,
        startTime: row.validated_start ?? sh.start_time ?? '',
        endTime: row.validated_end ?? sh.end_time ?? '',
        color: sh.color,
        textColor: sh.text_color,
      });
    }

    const punchByDate = new Map<string, TimePunchRow>(
      (punchData ?? []).map((p) => [p.date, p as TimePunchRow])
    );

    const buildCtx = (date: string): DayContext => ({
      date,
      shift: shiftByDate.get(date) ?? null,
      punch: punchByDate.get(date) ?? null,
    });

    setTodayCtx(buildCtx(todayStr));
    setRecentDays(
      dates.slice(1).map(buildCtx).filter((d) => d.punch)
    );
    setLoading(false);
  }, [employeeId, todayStr]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const canStart = useMemo(() => {
    if (!todayCtx?.shift) return false;
    if (todayCtx.punch) return false;
    return true;
  }, [todayCtx]);

  const handleClockIn = async () => {
    if (!employeeId || !todayCtx?.shift) return;

    setClockInLoading(true);
    const geo = normalizePunchGeoResult(await resolvePunchGeolocation(workSiteFence));

    const supabase = createClient();
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('time_declarations')
      .insert({
        employee_id: employeeId,
        date: todayStr,
        planned_start: todayCtx.shift.startTime,
        planned_end: todayCtx.shift.endTime,
        status: 'in_progress',
        clock_in_at: now,
        clock_in_lat: geo.lat,
        clock_in_lng: geo.lng,
        clock_in_accuracy_m: geo.accuracy_m,
        clock_in_inside_geofence: geo.inside_geofence,
        pause_minutes: 0,
        pause_15min: false,
        had_snack: false,
        ate_work_food: false,
      })
      .select()
      .single();

    setClockInLoading(false);
    if (error) {
      toast.error('Impossible d’enregistrer l’arrivée.');
      return;
    }
    toast.success(`Arrivée enregistrée à ${timestampToHHMM(now)}`);
    setTodayCtx((prev) =>
      prev ? { ...prev, punch: data as TimePunchRow } : prev
    );
  };

  const handleClockOutConfirm = async () => {
    if (!employeeId || !todayCtx?.punch) return;

    setClockOutLoading(true);
    const geo = normalizePunchGeoResult(await resolvePunchGeolocation(workSiteFence));

    const supabase = createClient();
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('time_declarations')
      .update({
        clock_out_at: now,
        clock_out_lat: geo.lat,
        clock_out_lng: geo.lng,
        clock_out_accuracy_m: geo.accuracy_m,
        clock_out_inside_geofence: geo.inside_geofence,
        pause_minutes: pauseMinutes,
        // L'ancienne case reste alignée pour les écrans qui l'affichent encore.
        pause_15min: pauseMinutes >= 15,
        had_snack: hadSnack,
        ate_work_food: ateWorkFood,
        note: note.trim() || null,
        status: 'pending',
      })
      .eq('id', todayCtx.punch.id)
      .select()
      .single();

    setClockOutLoading(false);
    if (error) {
      toast.error('Impossible d’enregistrer le départ.');
      return;
    }

    toast.success(`Départ enregistré à ${timestampToHHMM(now)}`);
    setOutDialogOpen(false);
    setNote('');
    setTodayCtx((prev) =>
      prev ? { ...prev, punch: data as TimePunchRow } : prev
    );
  };

  if (loading) return <PageSkeleton />;

  if (employeeId === null) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center px-4">
        <AlertCircle className="w-10 h-10 text-amber-500 mb-3" />
        <h2 className="text-lg font-bold text-slate-800">Compte non lié</h2>
        <p className="text-slate-500 text-sm mt-2">
          Contactez votre responsable pour finaliser la configuration.
        </p>
      </div>
    );
  }

  const punch = todayCtx?.punch;
  const shift = todayCtx?.shift;
  const punchStatus = punch?.status;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold text-slate-900 capitalize">
          {format(new Date(), 'EEEE d MMMM', { locale: fr })}
        </h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Pointez votre arrivée et votre départ sur le lieu de travail.
        </p>
      </div>

      {/* ── Carte du jour ─────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        {!shift ? (
          <div className="p-8 text-center">
            <Clock className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-sm font-semibold text-slate-700">
              Pas de shift travail aujourd’hui
            </p>
            <p className="text-xs text-slate-500 mt-2">
              Le pointage n’est disponible que les jours où un shift travail est
              prévu dans votre planning.
            </p>
          </div>
        ) : (
          <div className="p-5 space-y-4">
            <div className="flex items-center gap-3">
              <span
                className="px-2.5 py-1 rounded-lg text-xs font-bold"
                style={{ backgroundColor: shift.color, color: shift.textColor }}
              >
                {shift.shortName}
              </span>
              <span className="text-sm text-slate-600">
                Prévu : {shift.startTime} – {shift.endTime}
              </span>
            </div>

            {punch && punchStatus && (
              <div className="flex flex-wrap items-center gap-2">
                {(() => {
                  const s = STATUS_STYLE[punchStatus];
                  const Icon = s.icon;
                  return (
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-semibold ${s.pill}`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      {PUNCH_STATUS_LABEL[punchStatus]}
                    </span>
                  );
                })()}
                {punch.clock_in_at && (
                  <span className="text-xs text-slate-500">
                    Entrée :{' '}
                    <strong className="text-slate-700">
                      {timestampToHHMM(punch.clock_in_at)}
                    </strong>
                  </span>
                )}
                {punch.clock_out_at && (
                  <span className="text-xs text-slate-500">
                    Sortie :{' '}
                    <strong className="text-slate-700">
                      {timestampToHHMM(punch.clock_out_at)}
                    </strong>
                  </span>
                )}
              </div>
            )}

            {punch?.status === 'rejected' && punch.admin_note && (
              <p className="text-xs text-red-700 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
                Motif du refus : {punch.admin_note}
              </p>
            )}

            {punch?.note && (
              <p className="text-xs text-slate-600 bg-slate-50 border border-slate-100 rounded-xl px-3 py-2">
                Votre note : {punch.note}
              </p>
            )}

            {/* Actions */}
            {!punch && canStart && (
              <button
                type="button"
                onClick={() => void handleClockIn()}
                disabled={clockInLoading}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm transition-colors disabled:opacity-60"
              >
                {clockInLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <LogIn className="w-4 h-4" />
                )}
                Début de travail
              </button>
            )}

            {punch?.status === 'in_progress' && (
              <button
                type="button"
                onClick={() => {
                  // Pause proposée par défaut : le minimum imposé par la loi
                  // pour le temps déjà travaillé aujourd'hui.
                  const worked = punch.clock_in_at
                    ? (Date.now() - new Date(punch.clock_in_at).getTime()) / 3_600_000
                    : 0;
                  setOutWorkedHours(worked);
                  setPauseMinutes(legalBreakMinutes(worked));
                  setHadSnack(false);
                  setAteWorkFood(false);
                  setNote('');
                  setOutDialogOpen(true);
                }}
                disabled={clockOutLoading}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm transition-colors disabled:opacity-60"
              >
                <LogOut className="w-4 h-4" />
                Fin de travail
              </button>
            )}

            {punch &&
              (punch.status === 'pending' ||
                punch.status === 'approved' ||
                punch.status === 'auto_closed') && (
                <p className="text-xs text-slate-500 text-center py-2">
                  {punch.status === 'pending' || punch.status === 'auto_closed'
                    ? 'Votre journée est en attente de validation par l’administrateur.'
                    : 'Journée validée par l’administrateur.'}
                </p>
              )}
          </div>
        )}
      </div>

      {/* ── Mini historique (7 jours) ─────────────────────── */}
      {recentDays.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide px-1">
            Jours récents
          </p>
          {recentDays.map((day) => {
            const d = parseISO(day.date);
            const st = day.punch?.status;
            if (!st || !day.punch) return null;
            const style = STATUS_STYLE[st];
            const StatusIcon = style.icon;
            const { clockIn, clockOut } = getClockedTimes(day.punch);
            return (
              <div
                key={day.date}
                className="flex items-start justify-between gap-3 bg-white rounded-xl border border-slate-100 px-4 py-3"
              >
                <div className="min-w-0 space-y-1">
                  <p className="text-sm font-medium text-slate-800 capitalize">
                    {format(d, 'EEE d MMM', { locale: fr })}
                  </p>
                  {day.shift && (
                    <p className="text-[11px] text-slate-400">
                      {day.shift.shortName} · {day.shift.startTime}–
                      {day.shift.endTime}
                    </p>
                  )}
                  <div className="flex items-center gap-2 text-[11px] text-slate-600">
                    <LogIn className="w-3 h-3 shrink-0 text-slate-400" />
                    <span>{clockIn ?? '—'}</span>
                    <LogOut className="w-3 h-3 shrink-0 text-slate-400 ml-0.5" />
                    <span>{clockOut ?? '—'}</span>
                  </div>
                </div>
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-semibold shrink-0 ${style.pill}`}
                >
                  <StatusIcon className="w-3 h-3" />
                  {PUNCH_STATUS_LABEL[st]}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Pop-up fin de service ─────────────────────────── */}
      <Dialog open={outDialogOpen} onOpenChange={setOutDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Fin de service</DialogTitle>
            <DialogDescription>
              Confirmez les informations de votre journée avant d’enregistrer votre
              départ.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <BreakMinutesField
              value={pauseMinutes}
              onChange={setPauseMinutes}
              workedHours={outWorkedHours}
              label="Combien de temps de pause avez-vous pris ?"
            />
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={hadSnack}
                onChange={(e) => setHadSnack(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600"
              />
              <span className="text-sm text-slate-700 flex items-center gap-1.5">
                <Coffee className="w-3.5 h-3.5 text-amber-700" />
                J’ai pris une collation
              </span>
            </label>
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={ateWorkFood}
                onChange={(e) => setAteWorkFood(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600"
              />
              <span className="text-sm text-slate-700 flex items-center gap-1.5">
                <UtensilsCrossed className="w-3.5 h-3.5 text-slate-600" />
                J’ai mangé la nourriture du travail
              </span>
            </label>
            <div className="space-y-1.5 pt-1">
              <label htmlFor="clock-out-note" className="text-sm font-medium text-slate-700">
                Note (optionnel)
              </label>
              <Textarea
                id="clock-out-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Informations utiles pour votre responsable…"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setOutDialogOpen(false)}>
              Annuler
            </Button>
            <Button
              className="bg-indigo-600 hover:bg-indigo-700"
              onClick={() => void handleClockOutConfirm()}
              disabled={clockOutLoading}
            >
              {clockOutLoading ? 'Enregistrement…' : 'Confirmer le départ'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
