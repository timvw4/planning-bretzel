'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isToday,
  getDay,
  addMonths,
  addWeeks,
  startOfWeek,
  endOfWeek,
} from 'date-fns';
import { fr } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Clock, Sun, Info } from 'lucide-react';
import { getNextUpcomingWorkEntry, calculateShiftDuration, formatHours } from '@/lib/utils';
import { netWorkedHours } from '@/lib/swissBreaks';

interface Shift {
  id: string;
  name: string;
  shortName: string;
  type: string;
  startTime: string;
  endTime: string;
  color: string;
  textColor: string;
  durationHours: number;
}

interface ScheduleEntry {
  date: string;
  validatedStart: string | null;
  validatedEnd: string | null;
  /** Pause retenue sur la journée validée, en minutes. */
  breakMinutes: number;
  shift: Shift;
}

const WEEK_DAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

type CalendarView = 'month' | 'week';

// ── Squelettes de chargement ─────────────────────────────────
function StatsSkeleton() {
  return (
    <div className="grid grid-cols-3 gap-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="bg-white rounded-2xl border border-slate-100 p-4 space-y-2">
          <div className="h-3 w-14 rounded-full animate-shimmer" />
          <div className="h-7 w-10 rounded-lg animate-shimmer" />
          <div className="h-2.5 w-16 rounded-full animate-shimmer" />
        </div>
      ))}
    </div>
  );
}

function CalendarSkeleton() {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
      {/* En-tête */}
      <div className="px-4 py-4 border-b border-slate-100 space-y-3">
        <div className="flex items-center justify-between">
          <div className="h-8 w-8 rounded-xl animate-shimmer" />
          <div className="h-5 w-36 rounded-full animate-shimmer" />
          <div className="h-8 w-8 rounded-xl animate-shimmer" />
        </div>
        <div className="flex justify-center">
          <div className="h-8 w-44 rounded-xl animate-shimmer" />
        </div>
      </div>
      {/* Jours en-têtes */}
      <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50/50">
        {WEEK_DAYS.map((d) => (
          <div key={d} className="py-2 flex justify-center">
            <div className="h-3 w-6 rounded-full animate-shimmer" />
          </div>
        ))}
      </div>
      {/* Cellules */}
      <div className="grid grid-cols-7">
        {Array.from({ length: 35 }).map((_, i) => (
          <div key={i} className="h-20 border-b border-r border-slate-100 p-1.5">
            <div className="h-6 w-6 rounded-full animate-shimmer mb-1" />
            {i % 3 === 0 && <div className="rounded-lg h-10 animate-shimmer" />}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Page principale ──────────────────────────────────────────
export default function EmployeeSchedulePage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<CalendarView>('month');
  const [entries, setEntries] = useState<ScheduleEntry[]>([]);
  const [loading, setLoading] = useState(true);       // squelette initial uniquement
  const [isFetching, setIsFetching] = useState(false); // assombrissement pendant navigation
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  /** Réglage de l'établissement : les pauses sont-elles retirées des heures ? */
  const [deductBreaks, setDeductBreaks] = useState(false);
  /** Clé qui change quand les nouvelles données arrivent → déclenche l'animation */
  const [calendarKey, setCalendarKey] = useState(0);
  /** Classe d'animation appliquée lors du changement de clé */
  const [animClass, setAnimClass] = useState('animate-fade-in');
  /** Direction capturée au clic, lue quand les données arrivent */
  const pendingDir = useRef<'left' | 'right' | null>(null);
  const initialLoadDone = useRef(false);

  // Charger l'employeeId depuis le profil connecté
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

  // Charger les entrées : plage = union du mois et de la semaine courante
  const load = useCallback(async () => {
    if (!employeeId) return;
    // Premier chargement → squelette ; navigations suivantes → assombrissement discret
    if (!initialLoadDone.current) {
      setLoading(true);
    } else {
      setIsFetching(true);
    }
    const supabase = createClient();
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 });
    const fetchStart = monthStart < weekStart ? monthStart : weekStart;
    const fetchEnd = monthEnd > weekEnd ? monthEnd : weekEnd;
    const start = format(fetchStart, 'yyyy-MM-dd');
    const end = format(fetchEnd, 'yyyy-MM-dd');

    const { data } = await supabase
      .from('schedule_entries')
      .select(`date, validated_start, validated_end, validated_break_minutes, shifts (id, name, short_name, type, start_time, end_time, color, text_color, duration_hours)`)
      .eq('employee_id', employeeId)
      .eq('visible_to_employee', true)
      .gte('date', start)
      .lte('date', end)
      .order('date');

    if (data) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setEntries(data.map((row: any) => {
        const startT = row.validated_start ?? row.shifts.start_time ?? '';
        const endT = row.validated_end ?? row.shifts.end_time ?? '';
        const durationHours =
          row.validated_start && row.validated_end
            ? calculateShiftDuration(row.validated_start, row.validated_end)
            : (row.shifts.duration_hours ?? 0);
        return {
          date: row.date,
          validatedStart: row.validated_start ?? null,
          validatedEnd: row.validated_end ?? null,
          breakMinutes: row.validated_break_minutes ?? 0,
          shift: {
            id: row.shifts.id,
            name: row.shifts.name,
            shortName: row.shifts.short_name,
            type: row.shifts.type,
            startTime: startT,
            endTime: endT,
            color: row.shifts.color,
            textColor: row.shifts.text_color,
            durationHours,
          },
        };
      }));
    }

    const { data: settingsRow } = await supabase
      .from('app_settings')
      .select('deduct_breaks')
      .maybeSingle();
    setDeductBreaks(settingsRow?.deduct_breaks === true);

    // Détermine la classe d'animation selon la direction capturée au clic
    const dir = pendingDir.current;
    pendingDir.current = null;
    setAnimClass(
      dir === 'left'  ? 'animate-slide-left'  :
      dir === 'right' ? 'animate-slide-right' :
      'animate-fade-in'
    );
    setCalendarKey((k) => k + 1); // change la clé → remonte la grille → déclenche l'animation

    if (!initialLoadDone.current) {
      setLoading(false);
      initialLoadDone.current = true;
    }
    setIsFetching(false);
  }, [employeeId, currentDate]);

  useEffect(() => { load(); }, [load]);

  // Horloge pour le bandeau "prochain shift"
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const nextEntry = useMemo(
    () => getNextUpcomingWorkEntry(entries, now),
    [entries, now]
  );

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const monthStartStr = format(monthStart, 'yyyy-MM-dd');
  const monthEndStr = format(monthEnd, 'yyyy-MM-dd');
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startPad = (getDay(monthStart) + 6) % 7;
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 });
  const weekStartStr = format(weekStart, 'yyyy-MM-dd');
  const weekEndStr = format(weekEnd, 'yyyy-MM-dd');
  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });

  // Compte non lié à un employé
  if (!loading && employeeId === null) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center px-4 animate-fade-in">
        <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mb-4">
          <Info className="w-8 h-8 text-amber-500" />
        </div>
        <h2 className="text-lg font-bold text-slate-800 mb-2">Compte non lié</h2>
        <p className="text-slate-500 text-sm max-w-sm leading-relaxed">
          Votre compte n&apos;est pas encore associé à une fiche employé. Contactez votre responsable pour finaliser la configuration.
        </p>
      </div>
    );
  }

  // ── Handlers de navigation ───────────────────────────────────
  const handlePrev = () => {
    pendingDir.current = 'right';
    setCurrentDate((d) => viewMode === 'week' ? addWeeks(d, -1) : addMonths(d, -1));
  };
  const handleNext = () => {
    pendingDir.current = 'left';
    setCurrentDate((d) => viewMode === 'week' ? addWeeks(d, 1) : addMonths(d, 1));
  };

  const entryMap = new Map(entries.map((e) => [e.date, e]));

  // Stats : semaine ou mois selon le toggle
  const entriesForStats =
    viewMode === 'week'
      ? entries.filter((e) => e.date >= weekStartStr && e.date <= weekEndStr)
      : entries.filter((e) => e.date >= monthStartStr && e.date <= monthEndStr);
  const statsPeriodLabel = viewMode === 'week' ? 'cette semaine' : 'ce mois';
  const totalHours = entriesForStats.reduce(
    (s, e) =>
      e.validatedStart && e.validatedEnd
        ? s +
          netWorkedHours(
            calculateShiftDuration(e.validatedStart, e.validatedEnd),
            e.breakMinutes,
            deductBreaks
          )
        : s,
    0
  );
  const workedDays = entriesForStats.filter((e) => e.shift.type === 'work').length;
  const offDays = entriesForStats.filter((e) => e.shift.type === 'off').length;

  // ── Squelettes pendant le chargement ────────────────────────
  if (loading) {
    return (
      <div className="space-y-5">
        <StatsSkeleton />
        <CalendarSkeleton />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Message si aucun créneau */}
      {entries.length === 0 && employeeId && (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 animate-stagger-1">
          <p className="font-medium text-slate-800">Aucun planning affiché pour cette période</p>
          <p className="mt-1 text-xs text-slate-500 leading-relaxed">
            Soit vous n&apos;avez pas encore de créneaux prévus, soit votre responsable n&apos;a pas encore
            &quot;envoyé&quot; le planning depuis l&apos;interface admin. Revenez plus tard ou
            contactez votre équipe si besoin.
          </p>
        </div>
      )}

      {/* Prochain shift — stagger 1 */}
      {nextEntry && (
        <div
          className="rounded-2xl p-4 border flex items-start gap-3 animate-stagger-1"
          style={{ backgroundColor: nextEntry.shift.color, borderColor: nextEntry.shift.color }}
        >
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 opacity-90"
            style={{ backgroundColor: nextEntry.shift.textColor + '22', color: nextEntry.shift.textColor }}
            aria-hidden
          >
            <Clock className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold opacity-70" style={{ color: nextEntry.shift.textColor }}>
              Prochain shift
            </p>
            <p className="font-bold" style={{ color: nextEntry.shift.textColor }}>
              {format(new Date(nextEntry.date + 'T12:00:00'), 'EEEE d MMMM', { locale: fr })} — {nextEntry.shift.name}
            </p>
            {nextEntry.shift.startTime && (
              <p className="text-sm opacity-80" style={{ color: nextEntry.shift.textColor }}>
                {nextEntry.shift.startTime} → {nextEntry.shift.endTime}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Statistiques — stagger 2 */}
      <div className="grid grid-cols-3 gap-3 animate-stagger-2">
        <div className="bg-white rounded-2xl border border-slate-100 p-4">
          <div className="flex items-center gap-1.5 text-slate-400 mb-1">
            <Clock className="w-3.5 h-3.5" />
            <span className="text-[11px] font-semibold uppercase tracking-wide">Heures</span>
          </div>
          <p className="text-2xl font-bold text-slate-800">{formatHours(totalHours)}</p>
          <p className="text-xs text-slate-400 mt-0.5">validées · {statsPeriodLabel}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 p-4">
          <div className="flex items-center gap-1.5 text-slate-400 mb-1">
            <Sun className="w-3.5 h-3.5" />
            <span className="text-[11px] font-semibold uppercase tracking-wide">Travaillés</span>
          </div>
          <p className="text-2xl font-bold text-slate-800">{workedDays}</p>
          <p className="text-xs text-slate-400 mt-0.5">jours · {statsPeriodLabel}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 p-4">
          <div className="flex items-center gap-1.5 text-slate-400 mb-1">
            <Info className="w-3.5 h-3.5" />
            <span className="text-[11px] font-semibold uppercase tracking-wide">Repos</span>
          </div>
          <p className="text-2xl font-bold text-slate-800">{offDays}</p>
          <p className="text-xs text-slate-400 mt-0.5">jours · {statsPeriodLabel}</p>
        </div>
      </div>

      {/* Calendrier — stagger 3 */}
      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden animate-stagger-3">
        <div className="px-4 sm:px-5 py-4 border-b border-slate-100 space-y-3">
          {/* Navigation mois/semaine */}
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={handlePrev}
              className="h-8 w-8 shrink-0 flex items-center justify-center rounded-xl hover:bg-slate-100 transition-colors active:scale-95"
              aria-label={viewMode === 'week' ? 'Semaine précédente' : 'Mois précédent'}
            >
              <ChevronLeft className="w-4 h-4 text-slate-500" />
            </button>
            <h2 className="text-sm sm:text-base font-bold text-slate-800 text-center capitalize leading-snug px-1">
              {viewMode === 'month' ? (
                format(currentDate, 'MMMM yyyy', { locale: fr })
              ) : weekStart.getMonth() === weekEnd.getMonth() &&
                weekStart.getFullYear() === weekEnd.getFullYear() ? (
                <>
                  Semaine du {format(weekStart, 'd', { locale: fr })} au{' '}
                  {format(weekEnd, 'd MMMM yyyy', { locale: fr })}
                </>
              ) : (
                <>
                  Semaine du {format(weekStart, 'd MMM', { locale: fr })} au{' '}
                  {format(weekEnd, 'd MMM yyyy', { locale: fr })}
                </>
              )}
            </h2>
            <button
              type="button"
              onClick={handleNext}
              className="h-8 w-8 shrink-0 flex items-center justify-center rounded-xl hover:bg-slate-100 transition-colors active:scale-95"
              aria-label={viewMode === 'week' ? 'Semaine suivante' : 'Mois suivant'}
            >
              <ChevronRight className="w-4 h-4 text-slate-500" />
            </button>
          </div>

          {/* Toggle semaine / mois */}
          <div className="flex justify-center">
            <div
              className="inline-flex rounded-xl bg-slate-100 p-1 gap-0.5"
              role="group"
              aria-label="Affichage du planning"
            >
              <button
                type="button"
                onClick={() => setViewMode('week')}
                className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  viewMode === 'week'
                    ? 'bg-white text-indigo-700 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                Semaine
              </button>
              <button
                type="button"
                onClick={() => setViewMode('month')}
                className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  viewMode === 'month'
                    ? 'bg-white text-indigo-700 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                Mois
              </button>
            </div>
          </div>
        </div>

        {/* Jours de la semaine (en-têtes colonnes) */}
        <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50/50">
          {WEEK_DAYS.map((day) => (
            <div key={day} className="py-2 text-center text-[11px] font-bold text-slate-400 tracking-wide">
              {day}
            </div>
          ))}
        </div>

        {/* Grille calendrier — calendarKey change quand les données arrivent → animation */}
        {viewMode === 'month' ? (
          <div
            key={calendarKey}
            className={`grid grid-cols-7 ${animClass}`}
            style={{ opacity: isFetching ? 0.45 : 1, transition: 'opacity 0.15s ease' }}
          >
            {Array.from({ length: startPad }).map((_, i) => (
              <div key={`pad-${i}`} className="h-20 border-b border-r border-slate-50/80" />
            ))}

            {days.map((day) => {
              const dateStr = format(day, 'yyyy-MM-dd');
              const entry = entryMap.get(dateStr);
              const isCurrentDay = isToday(day);
              const isWeekend = getDay(day) === 0 || getDay(day) === 6;
              const shift = entry?.shift;
              const showWorkTimesOnly =
                shift &&
                shift.type === 'work' &&
                shift.startTime &&
                shift.endTime &&
                !(shift.startTime === '00:00' && shift.endTime === '00:00');

              return (
                <div
                  key={dateStr}
                  className={`h-20 border-b border-r border-slate-100 p-1.5 flex flex-col ${
                    isWeekend ? 'bg-slate-50/50' : ''
                  }`}
                >
                  <span
                    className={`text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full mb-1 shrink-0 ${
                      isCurrentDay
                        ? 'bg-indigo-600 text-white'
                        : isWeekend
                          ? 'text-slate-400'
                          : 'text-slate-600'
                    }`}
                  >
                    {format(day, 'd')}
                  </span>

                  {entry && (
                    <div
                      className="rounded-lg px-1 py-1 flex-1 flex flex-col items-center justify-center min-h-0 text-center gap-0.5"
                      style={{ backgroundColor: entry.shift.color, color: entry.shift.textColor }}
                    >
                      {showWorkTimesOnly ? (
                        <span className="text-[10px] font-semibold leading-tight">
                          {entry.shift.startTime}–{entry.shift.endTime}
                        </span>
                      ) : (
                        <span className="text-[11px] font-bold leading-tight truncate max-w-full">
                          {entry.shift.shortName}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div
            key={calendarKey}
            className={`grid grid-cols-7 ${animClass}`}
            style={{ opacity: isFetching ? 0.45 : 1, transition: 'opacity 0.15s ease' }}
          >
            {weekDays.map((day) => {
              const dateStr = format(day, 'yyyy-MM-dd');
              const entry = entryMap.get(dateStr);
              const isCurrentDay = isToday(day);
              const isWeekend = getDay(day) === 0 || getDay(day) === 6;
              const shift = entry?.shift;
              const showWorkTimesOnly =
                shift &&
                shift.type === 'work' &&
                shift.startTime &&
                shift.endTime &&
                !(shift.startTime === '00:00' && shift.endTime === '00:00');

              return (
                <div
                  key={dateStr}
                  className={`min-h-[120px] sm:min-h-[140px] border-b border-r border-slate-100 p-2 flex flex-col ${
                    isWeekend ? 'bg-slate-50/50' : ''
                  }`}
                >
                  <span
                    className={`text-xs font-bold w-7 h-7 flex items-center justify-center rounded-full mb-2 shrink-0 ${
                      isCurrentDay
                        ? 'bg-indigo-600 text-white'
                        : isWeekend
                          ? 'text-slate-400'
                          : 'text-slate-600'
                    }`}
                  >
                    {format(day, 'd')}
                  </span>

                  {entry && (
                    <div
                      className="rounded-xl px-2 py-2 flex-1 flex flex-col items-center justify-center min-h-0 text-center gap-1"
                      style={{ backgroundColor: entry.shift.color, color: entry.shift.textColor }}
                    >
                      {showWorkTimesOnly ? (
                        <span className="text-xs font-semibold leading-tight">
                          {entry.shift.startTime}–{entry.shift.endTime}
                        </span>
                      ) : (
                        <span className="text-sm font-bold leading-tight">{entry.shift.shortName}</span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
