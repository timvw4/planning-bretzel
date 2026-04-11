'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  format, startOfWeek, endOfWeek, eachDayOfInterval,
  addWeeks, isToday, getDay, parseISO, isFuture,
} from 'date-fns';
import { fr } from 'date-fns/locale';
import {
  ChevronLeft, ChevronRight, Clock, CheckCircle2,
  XCircle, AlertCircle, Send, Pencil, CalendarX,
} from 'lucide-react';
import toast from 'react-hot-toast';

// ── Types ────────────────────────────────────────────────────

interface ShiftInfo {
  name: string;
  shortName: string;
  startTime: string;
  endTime: string;
  color: string;
  textColor: string;
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
      {/* 7 cartes jours */}
      {Array.from({ length: 5 }).map((_, i) => (
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
    };

    let result: Declaration | null = null;

    if (existing) {
      const { data, error } = await supabase
        .from('time_declarations')
        .update({ actual_start: actualStart, actual_end: actualEnd, note: note.trim() || null, status: 'pending', admin_note: null, declared_at: new Date().toISOString() })
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
        .select('date, shifts (name, short_name, start_time, end_time, color, text_color)')
        .eq('employee_id', employeeId)
        .eq('visible_to_employee', true)
        .gte('date', start)
        .lte('date', end),
      supabase
        .from('time_declarations')
        .select('id, date, planned_start, planned_end, actual_start, actual_end, note, status, admin_note')
        .eq('employee_id', employeeId)
        .gte('date', start)
        .lte('date', end),
    ]);

    // Construire un map date → shift
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const shiftMap = new Map<string, ShiftInfo>((scheduleData ?? []).map((row: any) => [
      row.date,
      {
        name:      row.shifts.name,
        shortName: row.shifts.short_name,
        startTime: row.shifts.start_time ?? '',
        endTime:   row.shifts.end_time ?? '',
        color:     row.shifts.color,
        textColor: row.shifts.text_color,
      },
    ]));

    // Construire la liste des 7 jours de la semaine
    const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });
    setDays(weekDays.map((d) => {
      const dateStr = format(d, 'yyyy-MM-dd');
      return { date: dateStr, shift: shiftMap.get(dateStr) ?? null };
    }));

    // Map des déclarations
    const declMap = new Map<string, Declaration>(
      (declData ?? []).map((d) => [d.date, d as Declaration])
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

      {/* ── Liste des jours ────────────────────────────────── */}
      <div
        key={calendarKey}
        className={`space-y-2.5 ${animClass}`}
        style={{ opacity: isFetching ? 0.45 : 1, transition: 'opacity 0.15s ease' }}
      >
        {days.map((day) => {
          const d = parseISO(day.date);
          const dayIdx = (getDay(d) + 6) % 7; // 0=Lun
          const isTodays = isToday(d);
          const isFutureDay = isFuture(d) && !isTodays;
          const decl = declarations.get(day.date);
          const isFormOpen = openForm === day.date;
          const canDeclare = !isFutureDay && day.shift;

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

                    {/* Shift chip */}
                    {day.shift ? (
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span
                            className="px-2 py-0.5 rounded-lg text-xs font-bold"
                            style={{ backgroundColor: day.shift.color, color: day.shift.textColor }}
                          >
                            {day.shift.shortName}
                          </span>
                          <span className="text-xs text-slate-500">
                            {day.shift.startTime} – {day.shift.endTime}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 truncate mt-0.5">{day.shift.name}</p>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 text-slate-300">
                        <CalendarX className="w-3.5 h-3.5 shrink-0" />
                        <span className="text-xs">Pas de shift prévu</span>
                      </div>
                    )}
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
                        {/* Modifier si en attente */}
                        {decl.status === 'pending' && (
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
                    ) : isFutureDay ? (
                      <span className="text-[11px] text-slate-300 font-medium">À venir</span>
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

              {/* Formulaire inline */}
              {isFormOpen && (
                <div className="px-4 pb-4">
                  <DeclForm
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
        })}
      </div>

      {/* ── Légende statuts ────────────────────────────────── */}
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
    </div>
  );
}
