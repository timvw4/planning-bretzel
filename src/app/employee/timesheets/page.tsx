'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  format, startOfWeek, endOfWeek, eachDayOfInterval,
  addWeeks, isToday, getDay, parseISO,
} from 'date-fns';
import { fr } from 'date-fns/locale';
import {
  ChevronLeft, ChevronRight, Clock, CheckCircle2,
  XCircle, AlertCircle, Send, Pencil, CalendarX,
  Coffee, UtensilsCrossed,
} from 'lucide-react';
import toast from 'react-hot-toast';
import type { ShiftType } from '@/lib/types';

// ── Types ────────────────────────────────────────────────────

interface ShiftInfo {
  name: string;
  shortName: string;
  startTime: string;
  endTime: string;
  color: string;
  textColor: string;
  type: ShiftType;
}

interface DayEntry {
  date: string;        // 'yyyy-MM-dd'
  shift: ShiftInfo | null;
}

type DeclStatus = 'pending' | 'approved' | 'rejected';

interface Declaration {
  id: string;
  date: string;
  planned_start: string | null;
  planned_end: string | null;
  actual_start: string;
  actual_end: string;
  note: string | null;
  status: DeclStatus;
  admin_note: string | null;
  /** Pause d’au moins 15 min dans la journée */
  pause_15min: boolean;
  /** Collation prise */
  had_snack: boolean;
  /** Nourriture du travail */
  ate_work_food: boolean;
}

const STATUS_LABEL: Record<DeclStatus, string> = {
  pending:  'En attente',
  approved: 'Approuvé',
  rejected: 'Refusé',
};

const STATUS_STYLE: Record<DeclStatus, { pill: string; icon: React.ElementType }> = {
  pending:  { pill: 'bg-amber-50  border border-amber-200  text-amber-700',  icon: Clock },
  approved: { pill: 'bg-green-50  border border-green-200  text-green-700',  icon: CheckCircle2 },
  rejected: { pill: 'bg-red-50    border border-red-200    text-red-600',    icon: XCircle },
};

const WEEK_DAYS_FR = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

/** Shift affichable pour les heures : uniquement travail réel (pas OFF, congé, etc.). */
function isDeclarableWorkShift(sh: { type?: string | null; short_name?: string | null }): boolean {
  const t = (sh.type ?? '').toString().trim().toLowerCase();
  if (t !== 'work') return false;
  const sn = (sh.short_name ?? '').trim().toUpperCase();
  if (sn === 'OFF') return false;
  return true;
}

// ── Squelette ────────────────────────────────────────────────

function TimesheetSkeleton() {
  return (
    <div className="space-y-3">
      {/* Barre navigation */}
      <div className="flex items-center justify-between py-1">
        <div className="h-8 w-8 rounded-xl animate-shimmer" />
        <div className="h-5 w-40 rounded-full animate-shimmer" />
        <div className="h-8 w-8 rounded-xl animate-shimmer" />
      </div>
      {/* Cartes placeholder (liste variable en prod) */}
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="bg-white rounded-2xl border border-slate-100 p-4 space-y-2">
          <div className="flex items-center justify-between">
            <div className="h-4 w-24 rounded-full animate-shimmer" />
            <div className="h-6 w-20 rounded-xl animate-shimmer" />
          </div>
          <div className="h-9 w-full rounded-xl animate-shimmer" />
        </div>
      ))}
    </div>
  );
}

// ── Formulaire de déclaration (inline) ───────────────────────

interface DeclFormProps {
  day: DayEntry;
  existing: Declaration | null;
  onSaved: (decl: Declaration) => void;
  onCancel: () => void;
  employeeId: string;
}

function DeclForm({ day, existing, onSaved, onCancel, employeeId }: DeclFormProps) {
  const [actualStart, setActualStart] = useState(
    existing?.actual_start ?? day.shift?.startTime ?? '08:00'
  );
  const [actualEnd, setActualEnd] = useState(
    existing?.actual_end ?? day.shift?.endTime ?? '16:00'
  );
  const [note, setNote] = useState(existing?.note ?? '');
  /** Coché par défaut à la création ; en édition, valeur en base */
  const [pause15min, setPause15min] = useState(existing?.pause_15min ?? true);
  const [hadSnack, setHadSnack] = useState(existing?.had_snack ?? false);
  const [ateWorkFood, setAteWorkFood] = useState(existing?.ate_work_food ?? false);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!actualStart || !actualEnd) {
      toast.error('Veuillez saisir les heures de début et de fin');
      return;
    }
    setSaving(true);
    const supabase = createClient();

    const payload = {
      employee_id:   employeeId,
      date:          day.date,
      planned_start: day.shift?.startTime ?? null,
      planned_end:   day.shift?.endTime ?? null,
      actual_start:  actualStart,
      actual_end:    actualEnd,
      note:          note.trim() || null,
      status:        'pending' as const,
      pause_15min:   pause15min,
      had_snack:     hadSnack,
      ate_work_food: ateWorkFood,
    };

    let result: Declaration | null = null;

    if (existing) {
      const { data, error } = await supabase
        .from('time_declarations')
        .update({
          actual_start: actualStart,
          actual_end: actualEnd,
          note: note.trim() || null,
          status: 'pending',
          admin_note: null,
          declared_at: new Date().toISOString(),
          pause_15min: pause15min,
          had_snack: hadSnack,
          ate_work_food: ateWorkFood,
        })
        .eq('id', existing.id)
        .select()
        .single();
      if (error) { toast.error('Erreur lors de la mise à jour'); setSaving(false); return; }
      result = data as Declaration;
    } else {
      const { data, error } = await supabase
        .from('time_declarations')
        .insert(payload)
        .select()
        .single();
      if (error) { toast.error('Erreur lors de l\'enregistrement'); setSaving(false); return; }
      result = data as Declaration;
    }

    toast.success(existing ? 'Déclaration mise à jour !' : 'Heures déclarées !');
    onSaved(result!);
    setSaving(false);
  };

  return (
    <div className="mt-3 border-t border-slate-100 pt-3 animate-fade-in space-y-3">
      {/* Heures planifiées (lecture seule si shift) */}
      {day.shift && (
        <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-50 rounded-xl px-3 py-2">
          <Clock className="w-3.5 h-3.5 shrink-0" />
          <span>
            Shift prévu :{' '}
            <strong style={{ color: day.shift.textColor }}>{day.shift.name}</strong>
            {' '}— {day.shift.startTime} → {day.shift.endTime}
          </span>
        </div>
      )}

      {/* Saisie heures réelles */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[11px] font-semibold text-slate-500 mb-1.5">Heure d'arrivée</label>
          <input
            type="time"
            value={actualStart}
            onChange={(e) => setActualStart(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
          />
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-slate-500 mb-1.5">Heure de départ</label>
          <input
            type="time"
            value={actualEnd}
            onChange={(e) => setActualEnd(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
          />
        </div>
      </div>

      {/* Note optionnelle */}
      <div>
        <label className="block text-[11px] font-semibold text-slate-500 mb-1.5">Note (optionnelle)</label>
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Ex : arrivé en retard car bus supprimé..."
          className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400"
        />
      </div>

      {/* Pauses, collation, repas */}
      <div className="space-y-2.5 rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-3">
        <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Journée</p>
        <label className="flex items-start gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={pause15min}
            onChange={(e) => setPause15min(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-400"
          />
          <span className="text-sm text-slate-700 leading-snug">
            J’ai pris une pause d’au moins <strong>15 minutes</strong> pendant la journée
          </span>
        </label>
        <label className="flex items-start gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={hadSnack}
            onChange={(e) => setHadSnack(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-400"
          />
          <span className="text-sm text-slate-700 leading-snug">J’ai pris une collation</span>
        </label>
        <label className="flex items-start gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={ateWorkFood}
            onChange={(e) => setAteWorkFood(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-400"
          />
          <span className="text-sm text-slate-700 leading-snug">J’ai mangé la nourriture du travail</span>
        </label>
      </div>

      {/* Boutons */}
      <div className="flex gap-2">
        <button
          onClick={onCancel}
          className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-500 hover:bg-slate-50 transition-colors"
        >
          Annuler
        </button>
        <button
          onClick={handleSubmit}
          disabled={saving}
          className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
        >
          <Send className="w-3.5 h-3.5" />
          {saving ? 'Envoi…' : existing ? 'Mettre à jour' : 'Déclarer'}
        </button>
      </div>
    </div>
  );
}

// ── Page principale ──────────────────────────────────────────

export default function EmployeeTimesheetsPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [days, setDays] = useState<DayEntry[]>([]);
  const [declarations, setDeclarations] = useState<Map<string, Declaration>>(new Map());
  const [loading, setLoading] = useState(true);
  const [isFetching, setIsFetching] = useState(false);
  const [openForm, setOpenForm] = useState<string | null>(null); // date du formulaire ouvert
  const [calendarKey, setCalendarKey] = useState(0);
  const [animClass, setAnimClass] = useState('animate-fade-in');
  const pendingDir = useRef<'left' | 'right' | null>(null);
  const initialLoadDone = useRef(false);

  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const weekEnd   = endOfWeek(currentDate, { weekStartsOn: 1 });

  // Récupérer l'employeeId
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const { data: profile } = await supabase
        .from('profiles').select('employee_id').eq('id', data.user.id).single();
      setEmployeeId(profile?.employee_id ?? null);
    });
  }, []);

  // Charger shifts + déclarations de la semaine
  const loadData = useCallback(async () => {
    if (!employeeId) return;
    if (!initialLoadDone.current) { setLoading(true); } else { setIsFetching(true); }

    const supabase = createClient();
    const start = format(weekStart, 'yyyy-MM-dd');
    const end   = format(weekEnd,   'yyyy-MM-dd');

    const [{ data: scheduleData }, { data: declData }] = await Promise.all([
      supabase
        .from('schedule_entries')
        .select('date, validated_start, validated_end, shifts (name, short_name, start_time, end_time, color, text_color, type)')
        .eq('employee_id', employeeId)
        .eq('visible_to_employee', true)
        .gte('date', start)
        .lte('date', end),
      supabase
        .from('time_declarations')
        .select('id, date, planned_start, planned_end, actual_start, actual_end, note, status, admin_note, pause_15min, had_snack, ate_work_food')
        .eq('employee_id', employeeId)
        .gte('date', start)
        .lte('date', end),
    ]);

    // Uniquement les jours travaillés (type « work », jamais OFF / repos / congés…)
    const shiftMap = new Map<string, ShiftInfo>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const row of scheduleData ?? [] as any[]) {
      const sh = row.shifts;
      if (!sh || !isDeclarableWorkShift(sh)) continue;
      shiftMap.set(row.date, {
        name:      sh.name,
        shortName: sh.short_name,
        // Heures validées par l’admin (si présentes) = planning à jour
        startTime: row.validated_start ?? sh.start_time ?? '',
        endTime:   row.validated_end ?? sh.end_time ?? '',
        color:     sh.color,
        textColor: sh.text_color,
        type:      sh.type as ShiftType,
      });
    }

    // Construire la liste des 7 jours de la semaine
    const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });
    setDays(weekDays.map((d) => {
      const dateStr = format(d, 'yyyy-MM-dd');
      return { date: dateStr, shift: shiftMap.get(dateStr) ?? null };
    }));

    // Map des déclarations (valeurs par défaut si colonnes absentes avant migration)
    const declMap = new Map<string, Declaration>(
      (declData ?? []).map((d) => {
        const x = d as Declaration;
        return [
          d.date,
          {
            ...x,
            pause_15min: x.pause_15min ?? true,
            had_snack: x.had_snack ?? false,
            ate_work_food: x.ate_work_food ?? false,
          },
        ];
      })
    );
    setDeclarations(declMap);

    const dir = pendingDir.current;
    pendingDir.current = null;
    setAnimClass(
      dir === 'left'  ? 'animate-slide-left'  :
      dir === 'right' ? 'animate-slide-right' :
      'animate-fade-in'
    );
    setCalendarKey((k) => k + 1);
    setOpenForm(null);

    if (!initialLoadDone.current) { setLoading(false); initialLoadDone.current = true; }
    setIsFetching(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeId, format(weekStart, 'yyyy-MM-dd')]);

  useEffect(() => { loadData(); }, [loadData]);

  const handlePrev = () => { pendingDir.current = 'right'; setCurrentDate((d) => addWeeks(d, -1)); };
  const handleNext = () => { pendingDir.current = 'left';  setCurrentDate((d) => addWeeks(d, 1)); };

  const handleDeclSaved = (decl: Declaration) => {
    setDeclarations((prev) => new Map(prev).set(decl.date, decl));
    setOpenForm(null);
  };

  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const weekStartStr = format(weekStart, 'yyyy-MM-dd');

  /** Jours passés + aujourd’hui, uniquement s’il y a un shift travail déclarable (pas sans shift, pas OFF) */
  const visibleDays = useMemo(() => {
    return days
      .filter((day) => {
        if (day.date > todayStr) return false;
        return Boolean(day.shift);
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [days, todayStr]);

  /** Semaine entièrement après aujourd’hui (navigation vers une semaine future) */
  const weekEntirelyInFuture = weekStartStr > todayStr;

  if (loading) return <TimesheetSkeleton />;

  if (employeeId === null) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center px-4 animate-fade-in">
        <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mb-4">
          <AlertCircle className="w-8 h-8 text-amber-500" />
        </div>
        <h2 className="text-lg font-bold text-slate-800 mb-2">Compte non lié</h2>
        <p className="text-slate-500 text-sm max-w-sm">Contactez votre responsable pour finaliser la configuration.</p>
      </div>
    );
  }

  const isCurrentWeek =
    format(weekStart, 'yyyy-MM-dd') === format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');

  return (
    <div className="space-y-4">

      {/* ── Navigation semaine ─────────────────────────────── */}
      <div className="flex items-center justify-between animate-stagger-1">
        <button
          onClick={handlePrev}
          className="h-9 w-9 flex items-center justify-center rounded-xl bg-white border border-slate-200 hover:bg-slate-50 transition-colors active:scale-95"
          aria-label="Semaine précédente"
        >
          <ChevronLeft className="w-4 h-4 text-slate-500" />
        </button>

        <div className="text-center">
          <p className="text-sm font-bold text-slate-800">
            {isCurrentWeek ? 'Cette semaine' : (
              <>
                {format(weekStart, 'd MMM', { locale: fr })} – {format(weekEnd, 'd MMM yyyy', { locale: fr })}
              </>
            )}
          </p>
          {isCurrentWeek && (
            <p className="text-xs text-slate-400">
              {format(weekStart, 'd MMM', { locale: fr })} – {format(weekEnd, 'd MMM yyyy', { locale: fr })}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          {isFetching && <span className="w-3 h-3 rounded-full border-2 border-slate-300 border-t-indigo-500 animate-spin" />}
          <button
            onClick={handleNext}
            className="h-9 w-9 flex items-center justify-center rounded-xl bg-white border border-slate-200 hover:bg-slate-50 transition-colors active:scale-95"
            aria-label="Semaine suivante"
          >
            <ChevronRight className="w-4 h-4 text-slate-500" />
          </button>
        </div>
      </div>

      <p className="text-[11px] text-slate-500 text-center px-1 -mt-1 leading-relaxed">
        <strong>Jours passés et aujourd’hui</strong> où vous avez un shift <strong>travail</strong> (repos, OFF, congés… ne
        sont pas listés). Les jours futurs sont masqués.
      </p>

      {/* ── Liste des jours ────────────────────────────────── */}
      <div
        key={calendarKey}
        className={`space-y-2.5 ${animClass}`}
        style={{ opacity: isFetching ? 0.45 : 1, transition: 'opacity 0.15s ease' }}
      >
        {visibleDays.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white/80 px-5 py-12 text-center animate-fade-in">
            <CalendarX className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            {weekEntirelyInFuture ? (
              <>
                <p className="text-sm font-semibold text-slate-700">Cette semaine n’a pas encore commencé</p>
                <p className="text-xs text-slate-500 mt-2 max-w-sm mx-auto leading-relaxed">
                  Les jours à déclarer apparaîtront ici une fois la date passée (ou le jour même pour aujourd’hui). Revenez
                  plus tard ou consultez une semaine déjà terminée avec les flèches.
                </p>
              </>
            ) : (
              <>
                <p className="text-sm font-semibold text-slate-700">Rien à afficher pour cette période</p>
                <p className="text-xs text-slate-500 mt-2 max-w-sm mx-auto leading-relaxed">
                  Pas de shift travail à déclarer sur les jours déjà passés, ou tout est déjà à jour.
                </p>
              </>
            )}
          </div>
        ) : (
          visibleDays.map((day) => {
          const shift = day.shift;
          if (!shift) return null;
          const d = parseISO(day.date);
          const dayIdx = (getDay(d) + 6) % 7; // 0=Lun
          const isTodays = isToday(d);
          const decl = declarations.get(day.date);
          const isFormOpen = openForm === day.date;
          const canDeclare = day.date <= todayStr;
          const canEditPending = decl?.status === 'pending';

          return (
            <div
              key={day.date}
              className={`bg-white rounded-2xl border transition-all duration-200 overflow-hidden ${
                isTodays
                  ? 'border-indigo-200 shadow-sm shadow-indigo-100'
                  : 'border-slate-100'
              }`}
            >
              <div className="p-4">
                {/* En-tête du jour */}
                <div className="flex items-center justify-between gap-3">
                  {/* Jour + date */}
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-10 h-10 rounded-xl flex flex-col items-center justify-center shrink-0 ${
                      isTodays ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'
                    }`}>
                      <span className={`text-[9px] font-bold uppercase tracking-wide ${isTodays ? 'text-indigo-200' : 'text-slate-400'}`}>
                        {WEEK_DAYS_FR[dayIdx]}
                      </span>
                      <span className="text-base font-bold leading-tight">
                        {format(d, 'd')}
                      </span>
                    </div>

                    {/* Shift travail */}
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span
                          className="px-2 py-0.5 rounded-lg text-xs font-bold"
                          style={{ backgroundColor: shift.color, color: shift.textColor }}
                        >
                          {shift.shortName}
                        </span>
                        <span className="text-xs text-slate-500">
                          {shift.startTime} – {shift.endTime}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 truncate mt-0.5">{shift.name}</p>
                    </div>
                  </div>

                  {/* Action / statut */}
                  <div className="shrink-0">
                    {decl ? (
                      /* Déclaration existante */
                      <div className="flex items-center gap-1.5">
                        {/* Badge statut */}
                        {(() => {
                          const s = STATUS_STYLE[decl.status];
                          const Icon = s.icon;
                          return (
                            <span className={`flex items-center gap-1 px-2 py-1 rounded-xl text-[11px] font-semibold ${s.pill}`}>
                              <Icon className="w-3 h-3" />
                              {STATUS_LABEL[decl.status]}
                            </span>
                          );
                        })()}
                        {/* Modifier si en attente et jour travail */}
                        {canEditPending && (
                          <button
                            onClick={() => setOpenForm(isFormOpen ? null : day.date)}
                            className="h-7 w-7 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-indigo-600 transition-colors"
                            title="Modifier"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    ) : canDeclare ? (
                      /* Bouton déclarer */
                      <button
                        onClick={() => setOpenForm(isFormOpen ? null : day.date)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                          isFormOpen
                            ? 'bg-slate-100 text-slate-600'
                            : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                        }`}
                      >
                        <Clock className="w-3.5 h-3.5" />
                        {isFormOpen ? 'Annuler' : 'Déclarer'}
                      </button>
                    ) : null}
                  </div>
                </div>

                {/* Heures déclarées résumées */}
                {decl && !isFormOpen && (
                  <div className="mt-2.5 flex items-center gap-3 flex-wrap">
                    <div className="flex items-center gap-1.5 text-xs text-slate-600">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      <span className="font-semibold">{decl.actual_start}</span>
                      <span className="text-slate-400">→</span>
                      <span className="font-semibold">{decl.actual_end}</span>
                    </div>
                    {/* Écart si différent du prévu */}
                    {decl.planned_start && decl.planned_start !== decl.actual_start && (
                      <span className="text-[11px] text-amber-600 bg-amber-50 px-2 py-0.5 rounded-lg border border-amber-200">
                        Prévu : {decl.planned_start} – {decl.planned_end}
                      </span>
                    )}
                    {decl.note && (
                      <span className="text-[11px] text-slate-400 italic truncate max-w-[180px]">
                        « {decl.note} »
                      </span>
                    )}
                    {/* Résumé pause / collation / repas */}
                    <div className="flex flex-wrap items-center gap-1.5 w-full">
                      {(decl.pause_15min ?? true) ? (
                        <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-md">
                          <Clock className="w-3 h-3" /> Pause 15 min
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-amber-800 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-md">
                          <AlertCircle className="w-3 h-3" /> Pas de pause 15 min
                        </span>
                      )}
                      {decl.had_snack && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-slate-600 bg-white border border-slate-200 px-1.5 py-0.5 rounded-md">
                          <Coffee className="w-3 h-3" /> Collation
                        </span>
                      )}
                      {decl.ate_work_food && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-slate-600 bg-white border border-slate-200 px-1.5 py-0.5 rounded-md">
                          <UtensilsCrossed className="w-3 h-3" /> Repas travail
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Note admin si refusé */}
                {decl?.status === 'rejected' && decl.admin_note && !isFormOpen && (
                  <div className="mt-2 flex items-start gap-1.5 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
                    <XCircle className="w-3.5 h-3.5 text-red-400 mt-0.5 shrink-0" />
                    <p className="text-[11px] text-red-600">
                      <strong>Motif :</strong> {decl.admin_note}
                    </p>
                  </div>
                )}

              </div>

              {/* Formulaire inline (chaque carte affichée a un shift travail) */}
              {isFormOpen && (
                <div className="px-4 pb-4">
                  <DeclForm
                    key={`${day.date}-${decl?.id ?? 'new'}`}
                    day={day}
                    existing={decl ?? null}
                    onSaved={handleDeclSaved}
                    onCancel={() => setOpenForm(null)}
                    employeeId={employeeId}
                  />
                </div>
              )}
            </div>
          );
          })
        )}
      </div>

      {/* ── Légende statuts ────────────────────────────────── */}
      {visibleDays.length > 0 && (
      <div className="flex items-center justify-center gap-4 pt-1 animate-stagger-4">
        {(Object.entries(STATUS_STYLE) as [DeclStatus, typeof STATUS_STYLE[DeclStatus]][]).map(([status, s]) => {
          const Icon = s.icon;
          return (
            <div key={status} className="flex items-center gap-1.5">
              <Icon className="w-3 h-3" style={{ color: undefined }} />
              <span className="text-[11px] text-slate-400">{STATUS_LABEL[status]}</span>
            </div>
          );
        })}
      </div>
      )}
    </div>
  );
}
