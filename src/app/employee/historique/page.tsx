'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  format,
  startOfMonth,
  endOfMonth,
  subMonths,
  addMonths,
  isSameMonth,
  parseISO,
} from 'date-fns';
import { fr } from 'date-fns/locale';
import {
  History,
  Clock,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { calculateShiftDuration, formatHours } from '@/lib/utils';
import { netWorkedHours } from '@/lib/swissBreaks';

const MONTHS_TO_SHOW = 12;

interface ShiftInfo {
  shortName: string;
  name: string;
  color: string;
  textColor: string;
}

interface ValidatedEntry {
  date: string;
  validatedStart: string;
  validatedEnd: string;
  breakMinutes: number;
  shift: ShiftInfo | null;
}

function PageSkeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      <div className="h-10 rounded-xl bg-slate-100" />
      <div className="h-24 rounded-2xl bg-slate-100" />
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-16 rounded-2xl bg-slate-100" />
      ))}
    </div>
  );
}

export default function EmployeeHistoriquePage() {
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [entries, setEntries] = useState<ValidatedEntry[]>([]);
  const [currentMonth, setCurrentMonth] = useState(() => startOfMonth(new Date()));
  /** Réglage de l'établissement : les pauses sont-elles retirées des heures ? */
  const [deductBreaks, setDeductBreaks] = useState(false);

  const now = useMemo(() => new Date(), []);
  const earliestMonth = useMemo(
    () => startOfMonth(subMonths(now, MONTHS_TO_SHOW - 1)),
    [now]
  );
  const currentMonthStart = startOfMonth(now);

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

  const loadData = useCallback(async (silent = false) => {
    if (!employeeId) return;
    if (silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setLoadError(null);

    const supabase = createClient();
    const rangeStart = format(earliestMonth, 'yyyy-MM-dd');
    const rangeEnd = format(endOfMonth(now), 'yyyy-MM-dd');

    const { data, error } = await supabase
      .from('schedule_entries')
      .select(
        'date, validated_start, validated_end, validated_break_minutes, shifts (short_name, name, color, text_color)'
      )
      .eq('employee_id', employeeId)
      .eq('visible_to_employee', true)
      .gte('date', rangeStart)
      .lte('date', rangeEnd)
      .not('validated_start', 'is', null)
      .not('validated_end', 'is', null)
      .order('date', { ascending: false });

    if (error) {
      setLoadError('Impossible de charger l’historique. Vérifiez votre connexion.');
      if (silent) setRefreshing(false);
      else setLoading(false);
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parsed: ValidatedEntry[] = (data ?? []).map((row: any) => ({
      date: row.date,
      validatedStart: row.validated_start,
      validatedEnd: row.validated_end,
      breakMinutes: row.validated_break_minutes ?? 0,
      shift: row.shifts
        ? {
            shortName: row.shifts.short_name,
            name: row.shifts.name,
            color: row.shifts.color,
            textColor: row.shifts.text_color,
          }
        : null,
    }));

    setEntries(parsed);

    const { data: settingsRow } = await supabase
      .from('app_settings')
      .select('deduct_breaks')
      .maybeSingle();
    setDeductBreaks(settingsRow?.deduct_breaks === true);

    setLoading(false);
    setRefreshing(false);
  }, [employeeId, earliestMonth, now]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const monthStartStr = format(startOfMonth(currentMonth), 'yyyy-MM-dd');
  const monthEndStr = format(endOfMonth(currentMonth), 'yyyy-MM-dd');
  const isCurrentMonth = isSameMonth(currentMonth, now);

  const monthEntries = useMemo(
    () =>
      entries.filter((e) => e.date >= monthStartStr && e.date <= monthEndStr),
    [entries, monthStartStr, monthEndStr]
  );

  /** Heures d'une journée, pause retirée si l'établissement la déduit. */
  const entryHours = useCallback(
    (entry: ValidatedEntry) =>
      netWorkedHours(
        calculateShiftDuration(entry.validatedStart, entry.validatedEnd),
        entry.breakMinutes,
        deductBreaks
      ),
    [deductBreaks]
  );

  const monthHours = useMemo(
    () => monthEntries.reduce((sum, e) => sum + entryHours(e), 0),
    [monthEntries, entryHours]
  );

  const canGoPrev = startOfMonth(currentMonth) > earliestMonth;
  const canGoNext = startOfMonth(currentMonth) < currentMonthStart;

  const handlePrev = () => {
    if (!canGoPrev) return;
    setCurrentMonth((d) => subMonths(d, 1));
  };

  const handleNext = () => {
    if (!canGoNext) return;
    setCurrentMonth((d) => addMonths(d, 1));
  };

  if (loading) return <PageSkeleton />;

  if (!employeeId) {
    return (
      <div className="text-center py-16 text-slate-500 text-sm">
        Compte non lié à un employé.
      </div>
    );
  }

  if (loadError && entries.length === 0) {
    return (
      <div className="space-y-5">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <History className="w-5 h-5 text-indigo-600" />
            Historique
          </h2>
        </div>
        <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-8 text-center space-y-3">
          <AlertCircle className="w-8 h-8 text-red-500 mx-auto" />
          <p className="text-sm text-red-700">{loadError}</p>
          <button
            type="button"
            onClick={() => void loadData()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-red-200 text-sm font-semibold text-red-700 hover:bg-red-50 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Réessayer
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <History className="w-5 h-5 text-indigo-600" />
            Historique
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Heures validées par votre responsable
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadData(true)}
          disabled={refreshing}
          title="Actualiser"
          className="h-8 w-8 flex items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {loadError && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 flex items-center justify-between gap-2 text-xs text-amber-800">
          <span>{loadError}</span>
          <button
            type="button"
            onClick={() => void loadData(true)}
            className="font-semibold underline shrink-0"
          >
            Réessayer
          </button>
        </div>
      )}

      {/* Navigation mois */}
      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <button
            type="button"
            onClick={handlePrev}
            disabled={!canGoPrev}
            className="h-8 w-8 flex items-center justify-center rounded-xl hover:bg-slate-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            aria-label="Mois précédent"
          >
            <ChevronLeft className="w-4 h-4 text-slate-500" />
          </button>
          <h3 className="text-sm font-bold text-slate-800 capitalize">
            {format(currentMonth, 'MMMM yyyy', { locale: fr })}
          </h3>
          <button
            type="button"
            onClick={handleNext}
            disabled={!canGoNext}
            className="h-8 w-8 flex items-center justify-center rounded-xl hover:bg-slate-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            aria-label="Mois suivant"
          >
            <ChevronRight className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        {/* Synthèse du mois */}
        <div className="px-4 py-4 bg-gradient-to-br from-emerald-600 to-emerald-700 text-white">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-emerald-200 text-[10px] font-semibold uppercase tracking-wide mb-1">
                <Clock className="w-3 h-3" />
                Total du mois
              </div>
              <p className="text-2xl font-bold">{formatHours(monthHours)}</p>
              <p className="text-xs text-emerald-100 mt-0.5">
                {monthEntries.length > 0
                  ? `${monthEntries.length} jour${monthEntries.length > 1 ? 's' : ''} validé${monthEntries.length > 1 ? 's' : ''}`
                  : 'Aucun jour validé'}
              </p>
            </div>
            {isCurrentMonth && (
              <span className="text-[10px] font-bold uppercase tracking-wide text-emerald-700 bg-white/90 px-2.5 py-1 rounded-full shrink-0">
                En cours
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Liste jour par jour */}
      <div className="space-y-2">
        {monthEntries.length === 0 ? (
          <div className="rounded-2xl border border-slate-100 bg-white px-4 py-10 text-center">
            <Clock className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-medium text-slate-600">Aucun jour validé ce mois</p>
            <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">
              Les heures apparaissent ici une fois approuvées dans l&apos;onglet Pointages.
            </p>
          </div>
        ) : (
          monthEntries.map((entry) => {
            const d = parseISO(entry.date);
            const duration = entryHours(entry);
            return (
              <div
                key={entry.date}
                className="flex items-start justify-between gap-3 bg-white rounded-xl border border-slate-100 px-4 py-3"
              >
                <div className="min-w-0 space-y-1">
                  <p className="text-sm font-medium text-slate-800 capitalize">
                    {format(d, 'EEE d MMM', { locale: fr })}
                  </p>
                  {entry.shift && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className="px-2 py-0.5 rounded-md text-[10px] font-bold"
                        style={{
                          backgroundColor: entry.shift.color,
                          color: entry.shift.textColor,
                        }}
                      >
                        {entry.shift.shortName}
                      </span>
                      <span className="text-[11px] text-slate-400">
                        {entry.shift.name}
                      </span>
                    </div>
                  )}
                  <p className="text-[11px] text-slate-600 font-medium">
                    {entry.validatedStart} – {entry.validatedEnd}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-semibold bg-green-50 border border-green-200 text-green-700">
                    <CheckCircle2 className="w-3 h-3" />
                    Validé
                  </span>
                  <span className="text-xs font-bold text-emerald-600">
                    {formatHours(duration)}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>

      <p className="text-xs text-slate-400 text-center px-2 pb-2">
        Seules les heures approuvées dans l&apos;onglet Pointages apparaissent ici.
      </p>
    </div>
  );
}
