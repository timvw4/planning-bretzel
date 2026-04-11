'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval,
  getDay, isToday, addMonths, isPast, parseISO,
} from 'date-fns';
import { fr } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Lock, CheckCircle, Clock, XCircle, Send, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';

type AvailabilityStatus = 'available' | 'unavailable' | 'preferred';
type MonthState = 'editable' | 'validated' | 'request_pending' | 'request_rejected';

interface AvailabilityEntry {
  date: string;
  status: AvailabilityStatus;
}

const STATUS_CONFIG: Record<AvailabilityStatus, {
  label: string; icon: string; bg: string; text: string; border: string;
}> = {
  available:   { label: 'Disponible',   icon: '✓', bg: '#DCFCE7', text: '#15803D', border: '#86EFAC' },
  preferred:   { label: 'Préféré',      icon: '★', bg: '#FEF9C3', text: '#A16207', border: '#FDE047' },
  unavailable: { label: 'Indisponible', icon: '✗', bg: '#FEE2E2', text: '#DC2626', border: '#FCA5A5' },
};

// Cycle : null → available → preferred → unavailable → null
const CYCLE: (AvailabilityStatus | null)[] = [null, 'available', 'preferred', 'unavailable'];
const WEEK_DAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

function getNextStatus(current: AvailabilityStatus | undefined): AvailabilityStatus | null {
  const idx = CYCLE.indexOf(current ?? null);
  return CYCLE[(idx + 1) % CYCLE.length];
}

// ── Squelette de chargement initial ─────────────────────────
function AvailabilitySkeleton() {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-2xl border border-slate-100 bg-white p-3 text-center space-y-1.5">
            <div className="h-7 w-8 rounded-lg animate-shimmer mx-auto" />
            <div className="h-3 w-14 rounded-full animate-shimmer mx-auto" />
          </div>
        ))}
      </div>
      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="h-8 w-8 rounded-xl animate-shimmer" />
          <div className="h-5 w-32 rounded-full animate-shimmer" />
          <div className="h-8 w-8 rounded-xl animate-shimmer" />
        </div>
        <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50/50">
          {WEEK_DAYS.map((d) => (
            <div key={d} className="py-2 flex justify-center">
              <div className="h-3 w-6 rounded-full animate-shimmer" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {Array.from({ length: 35 }).map((_, i) => (
            <div key={i} className="h-[72px] border-b border-r border-slate-100 p-1.5">
              <div className="h-6 w-6 rounded-full animate-shimmer" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Page principale ──────────────────────────────────────────
export default function EmployeeAvailabilityPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [availabilities, setAvailabilities] = useState<Map<string, AvailabilityEntry>>(new Map());
  const [loading, setLoading] = useState(true);
  const [isFetching, setIsFetching] = useState(false);
  /** Date en cours de sync (sauvegarde optimiste en arrière-plan) */
  const [syncingDate, setSyncingDate] = useState<string | null>(null);
  /** Date survolée pour prévisualiser le prochain statut */
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);

  const [calendarKey, setCalendarKey] = useState(0);
  const [animClass, setAnimClass] = useState('animate-fade-in');
  const pendingDir = useRef<'left' | 'right' | null>(null);
  const initialLoadDone = useRef(false);

  const [monthState, setMonthState] = useState<MonthState>('editable');

  const [showValidateModal, setShowValidateModal] = useState(false);
  const [showUnlockModal, setShowUnlockModal] = useState(false);
  const [unlockReason, setUnlockReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const monthKey = format(currentDate, 'yyyy-MM');

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const { data: profile } = await supabase
        .from('profiles').select('employee_id').eq('id', data.user.id).single();
      setEmployeeId(profile?.employee_id ?? null);
    });
  }, []);

  const loadData = useCallback(async () => {
    if (!employeeId) return;
    if (!initialLoadDone.current) { setLoading(true); } else { setIsFetching(true); }

    const supabase = createClient();
    const start = format(startOfMonth(currentDate), 'yyyy-MM-dd');
    const end = format(endOfMonth(currentDate), 'yyyy-MM-dd');

    const [{ data: avails }, { data: validation }, { data: unlockReq }] = await Promise.all([
      supabase.from('availability_requests').select('date, status')
        .eq('employee_id', employeeId).gte('date', start).lte('date', end),
      supabase.from('availability_validations').select('id')
        .eq('employee_id', employeeId).eq('month_key', monthKey).maybeSingle(),
      supabase.from('availability_unlock_requests').select('id, status')
        .eq('employee_id', employeeId).eq('month_key', monthKey)
        .order('requested_at', { ascending: false }).limit(1).maybeSingle(),
    ]);

    const map = new Map<string, AvailabilityEntry>();
    (avails ?? []).forEach((row) =>
      map.set(row.date, { date: row.date, status: row.status as AvailabilityStatus })
    );
    setAvailabilities(map);

    if (validation?.id) {
      if (unlockReq?.status === 'pending') setMonthState('request_pending');
      else if (unlockReq?.status === 'rejected') setMonthState('request_rejected');
      else setMonthState('validated');
    } else {
      setMonthState('editable');
    }

    const dir = pendingDir.current;
    pendingDir.current = null;
    setAnimClass(
      dir === 'left' ? 'animate-slide-left' :
      dir === 'right' ? 'animate-slide-right' :
      'animate-fade-in'
    );
    setCalendarKey((k) => k + 1);

    if (!initialLoadDone.current) { setLoading(false); initialLoadDone.current = true; }
    setIsFetching(false);
  }, [employeeId, currentDate, monthKey]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Clic sur un jour : mise à jour optimiste ─────────────────
  const handleDayClick = async (dateStr: string) => {
    if (!employeeId || monthState !== 'editable') return;
    if (isPast(parseISO(dateStr)) && dateStr !== format(new Date(), 'yyyy-MM-dd')) {
      toast.error('Impossible de modifier un jour passé');
      return;
    }

    const current = availabilities.get(dateStr);
    const next = getNextStatus(current?.status);

    // Snapshot pour rollback en cas d'erreur
    const snapshot = new Map(availabilities);

    // Mise à jour immédiate dans l'UI
    const optimistic = new Map(availabilities);
    if (!next) { optimistic.delete(dateStr); }
    else { optimistic.set(dateStr, { date: dateStr, status: next }); }
    setAvailabilities(optimistic);
    setSyncingDate(dateStr);

    // Sauvegarde en arrière-plan
    const supabase = createClient();
    const { error } = !next
      ? await supabase.from('availability_requests').delete()
          .eq('employee_id', employeeId).eq('date', dateStr)
      : await supabase.from('availability_requests').upsert(
          { employee_id: employeeId, date: dateStr, status: next },
          { onConflict: 'employee_id,date' }
        );

    if (error) {
      setAvailabilities(snapshot); // rollback
      toast.error('Erreur de sauvegarde, veuillez réessayer');
    }
    setSyncingDate(null);
  };

  const handleValidate = async () => {
    if (!employeeId) return;
    setSubmitting(true);
    const supabase = createClient();
    const { error } = await supabase.from('availability_validations')
      .insert({ employee_id: employeeId, month_key: monthKey });
    if (error) { toast.error('Erreur lors de la validation'); }
    else { toast.success('Mois validé !'); setShowValidateModal(false); await loadData(); }
    setSubmitting(false);
  };

  const handleUnlockRequest = async () => {
    if (!employeeId || !unlockReason.trim()) return;
    setSubmitting(true);
    const supabase = createClient();
    const { error } = await supabase.from('availability_unlock_requests')
      .insert({ employee_id: employeeId, month_key: monthKey, reason: unlockReason.trim() });
    if (error) { toast.error("Erreur lors de l'envoi"); }
    else {
      toast.success('Demande envoyée à votre responsable');
      setShowUnlockModal(false);
      setUnlockReason('');
      await loadData();
    }
    setSubmitting(false);
  };

  const handlePrev = () => { pendingDir.current = 'right'; setCurrentDate((d) => addMonths(d, -1)); };
  const handleNext = () => { pendingDir.current = 'left';  setCurrentDate((d) => addMonths(d, 1)); };

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startPad = (getDay(monthStart) + 6) % 7;
  const countByStatus = (s: AvailabilityStatus) => [...availabilities.values()].filter((a) => a.status === s).length;
  const isLocked = monthState !== 'editable';

  if (!loading && employeeId === null) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center px-4 animate-fade-in">
        <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mb-4">
          <AlertTriangle className="w-8 h-8 text-amber-500" />
        </div>
        <h2 className="text-lg font-bold text-slate-800 mb-2">Compte non lié</h2>
        <p className="text-slate-500 text-sm max-w-sm">Contactez votre responsable pour finaliser la configuration.</p>
      </div>
    );
  }

  if (loading) return <AvailabilitySkeleton />;

  return (
    <div className="space-y-4">

      {/* ── Bannière état du mois ─────────────────────────────── */}
      {monthState === 'validated' && (
        <div className="bg-green-50 border border-green-200 rounded-2xl p-4 flex items-center justify-between gap-4 animate-stagger-1">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-green-100 rounded-xl flex items-center justify-center shrink-0">
              <CheckCircle className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm font-bold text-green-800">Mois validé</p>
              <p className="text-xs text-green-600">Vos disponibilités sont verrouillées.</p>
            </div>
          </div>
          <button
            onClick={() => setShowUnlockModal(true)}
            className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-green-700 bg-green-100 hover:bg-green-200 transition-colors"
          >
            <Send className="w-3.5 h-3.5" />
            Demander une modification
          </button>
        </div>
      )}

      {monthState === 'request_pending' && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center gap-3 animate-stagger-1">
          <div className="w-9 h-9 bg-amber-100 rounded-xl flex items-center justify-center shrink-0">
            <Clock className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <p className="text-sm font-bold text-amber-800">Demande en attente</p>
            <p className="text-xs text-amber-600">Votre responsable doit valider la réouverture.</p>
          </div>
        </div>
      )}

      {monthState === 'request_rejected' && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-center justify-between gap-4 animate-stagger-1">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-red-100 rounded-xl flex items-center justify-center shrink-0">
              <XCircle className="w-5 h-5 text-red-500" />
            </div>
            <div>
              <p className="text-sm font-bold text-red-700">Demande refusée</p>
              <p className="text-xs text-red-500">Vous pouvez soumettre une nouvelle demande.</p>
            </div>
          </div>
          <button
            onClick={() => setShowUnlockModal(true)}
            className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-red-600 bg-red-100 hover:bg-red-200 transition-colors"
          >
            <Send className="w-3.5 h-3.5" />
            Nouvelle demande
          </button>
        </div>
      )}

      {/* ── Résumé compteurs ─────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3 animate-stagger-2">
        {(Object.entries(STATUS_CONFIG) as [AvailabilityStatus, typeof STATUS_CONFIG[AvailabilityStatus]][]).map(([status, cfg]) => (
          <div
            key={status}
            className="rounded-2xl border p-3 text-center transition-all duration-300"
            style={{ backgroundColor: cfg.bg + '55', borderColor: cfg.border }}
          >
            <p className="text-2xl font-bold tabular-nums" style={{ color: cfg.text }}>
              {countByStatus(status)}
            </p>
            <p className="text-[11px] font-semibold mt-0.5" style={{ color: cfg.text }}>{cfg.label}</p>
          </div>
        ))}
      </div>

      {/* ── Calendrier ───────────────────────────────────────── */}
      <div
        className={`bg-white rounded-2xl border overflow-hidden animate-stagger-3 ${
          isLocked ? 'border-slate-200' : 'border-slate-100'
        }`}
      >
        {/* En-tête navigation */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <button
            onClick={handlePrev}
            className="h-8 w-8 flex items-center justify-center rounded-xl hover:bg-slate-100 transition-colors active:scale-95"
            aria-label="Mois précédent"
          >
            <ChevronLeft className="w-4 h-4 text-slate-500" />
          </button>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-slate-800 capitalize">
              {format(currentDate, 'MMMM yyyy', { locale: fr })}
            </h2>
            {isLocked && <Lock className="w-3.5 h-3.5 text-slate-400" />}
            {isFetching && (
              <span className="w-3 h-3 rounded-full border-2 border-slate-300 border-t-indigo-500 animate-spin" />
            )}
          </div>
          <button
            onClick={handleNext}
            className="h-8 w-8 flex items-center justify-center rounded-xl hover:bg-slate-100 transition-colors active:scale-95"
            aria-label="Mois suivant"
          >
            <ChevronRight className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        {/* Légende compacte du cycle (uniquement si éditable) */}
        {!isLocked && (
          <div className="flex items-center justify-center gap-1.5 px-4 py-2.5 bg-slate-50/60 border-b border-slate-100">
            <span className="text-[10px] text-slate-400 font-medium">Cycle :</span>
            {/* Aucun */}
            <span className="text-[10px] text-slate-300 font-medium">Aucun</span>
            <span className="text-[10px] text-slate-300">→</span>
            {/* Disponible */}
            <span className="flex items-center gap-1">
              <span className="w-4 h-4 rounded-md flex items-center justify-center text-[9px] font-bold"
                style={{ backgroundColor: STATUS_CONFIG.available.bg, color: STATUS_CONFIG.available.text }}>
                ✓
              </span>
              <span className="text-[10px] font-medium hidden sm:inline" style={{ color: STATUS_CONFIG.available.text }}>
                Dispo
              </span>
            </span>
            <span className="text-[10px] text-slate-300">→</span>
            {/* Préféré */}
            <span className="flex items-center gap-1">
              <span className="w-4 h-4 rounded-md flex items-center justify-center text-[9px] font-bold"
                style={{ backgroundColor: STATUS_CONFIG.preferred.bg, color: STATUS_CONFIG.preferred.text }}>
                ★
              </span>
              <span className="text-[10px] font-medium hidden sm:inline" style={{ color: STATUS_CONFIG.preferred.text }}>
                Préféré
              </span>
            </span>
            <span className="text-[10px] text-slate-300">→</span>
            {/* Indisponible */}
            <span className="flex items-center gap-1">
              <span className="w-4 h-4 rounded-md flex items-center justify-center text-[9px] font-bold"
                style={{ backgroundColor: STATUS_CONFIG.unavailable.bg, color: STATUS_CONFIG.unavailable.text }}>
                ✗
              </span>
              <span className="text-[10px] font-medium hidden sm:inline" style={{ color: STATUS_CONFIG.unavailable.text }}>
                Indispo
              </span>
            </span>
            <span className="text-[10px] text-slate-300">→</span>
            <span className="text-[10px] text-slate-300 font-medium">Aucun</span>
          </div>
        )}

        {/* En-têtes jours */}
        <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50/50">
          {WEEK_DAYS.map((day) => (
            <div key={day} className="py-2 text-center text-[11px] font-bold text-slate-400 tracking-wide">
              {day}
            </div>
          ))}
        </div>

        {/* Grille jours */}
        <div
          key={calendarKey}
          className={`grid grid-cols-7 ${animClass}`}
          style={{ opacity: isFetching ? 0.45 : 1, transition: 'opacity 0.15s ease' }}
        >
          {Array.from({ length: startPad }).map((_, i) => (
            <div key={`pad-${i}`} className="h-[72px] border-b border-r border-slate-50" />
          ))}

          {days.map((day) => {
            const dateStr = format(day, 'yyyy-MM-dd');
            const entry = availabilities.get(dateStr);
            const cfg = entry ? STATUS_CONFIG[entry.status] : null;
            const isCurrentDay = isToday(day);
            const isWE = getDay(day) === 0 || getDay(day) === 6;
            const isPastDay = isPast(parseISO(dateStr)) && dateStr !== format(new Date(), 'yyyy-MM-dd');
            const isSyncing = syncingDate === dateStr;
            const isHovered = hoveredDate === dateStr && !isLocked && !isPastDay;

            // Prochain statut (pour prévisualisation au survol)
            const nextStatus = getNextStatus(entry?.status);
            const nextCfg = nextStatus ? STATUS_CONFIG[nextStatus] : null;

            // Couleur de fond : status actuel ou prévisualisation au survol
            const bgColor = cfg?.bg ?? (isHovered && nextCfg ? nextCfg.bg + '30' : undefined);

            return (
              <button
                key={dateStr}
                onClick={() => handleDayClick(dateStr)}
                onMouseEnter={() => !isLocked && !isPastDay && setHoveredDate(dateStr)}
                onMouseLeave={() => setHoveredDate(null)}
                disabled={isPastDay || isLocked}
                className={`h-[72px] border-b border-r border-slate-100 p-1.5 flex flex-col items-center justify-start relative ${
                  isLocked
                    ? 'cursor-not-allowed'
                    : isPastDay
                    ? 'opacity-35 cursor-not-allowed'
                    : 'cursor-pointer'
                } ${isSyncing ? 'animate-sync-pulse' : ''}`}
                style={{
                  backgroundColor: bgColor,
                  transition: 'background-color 0.18s ease',
                }}
              >
                {/* Numéro du jour */}
                <span className={`text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full shrink-0 ${
                  isCurrentDay
                    ? 'bg-indigo-600 text-white'
                    : isWE
                    ? 'text-slate-400'
                    : 'text-slate-600'
                }`}>
                  {format(day, 'd')}
                </span>

                {/* Indicateur de statut */}
                <div className="flex-1 flex items-center justify-center">
                  {cfg ? (
                    <span
                      className="text-lg font-bold leading-none"
                      style={{ color: cfg.text, transition: 'color 0.18s ease' }}
                    >
                      {cfg.icon}
                    </span>
                  ) : isHovered && nextCfg ? (
                    /* Prévisualisation du prochain statut au survol */
                    <span
                      className="text-base font-bold leading-none opacity-40"
                      style={{ color: nextCfg.text }}
                    >
                      {nextCfg.icon}
                    </span>
                  ) : null}
                </div>

                {/* Anneau de sync discret */}
                {isSyncing && (
                  <span className="absolute inset-0 rounded-none ring-2 ring-inset ring-indigo-400/40 pointer-events-none" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Bouton de validation ──────────────────────────────── */}
      {monthState === 'editable' && (
        <button
          onClick={() => setShowValidateModal(true)}
          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm transition-colors shadow-md shadow-indigo-200/50 active:scale-[0.98] animate-stagger-4"
        >
          <CheckCircle className="w-4 h-4" />
          Valider mes disponibilités pour {format(currentDate, 'MMMM', { locale: fr })}
        </button>
      )}

      <p className="text-xs text-slate-400 text-center pb-2">
        {isLocked
          ? 'Ce mois est verrouillé. Demandez une modification à votre responsable.'
          : 'Les jours passés ne peuvent pas être modifiés.'}
      </p>

      {/* ── Modal confirmation validation ────────────────────── */}
      {showValidateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 animate-fade-in">
          <div className="bg-white rounded-3xl shadow-2xl p-6 w-full max-w-sm">
            <div className="w-12 h-12 bg-indigo-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Lock className="w-6 h-6 text-indigo-600" />
            </div>
            <h3 className="text-lg font-bold text-slate-800 text-center mb-2">Valider le mois ?</h3>
            <p className="text-sm text-slate-500 text-center leading-relaxed mb-6">
              Vos disponibilités pour{' '}
              <strong className="text-slate-700">{format(currentDate, 'MMMM yyyy', { locale: fr })}</strong>{' '}
              seront verrouillées. Pour les modifier ensuite, il faudra en faire la demande.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowValidateModal(false)}
                className="flex-1 py-3 rounded-2xl border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50 transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={handleValidate}
                disabled={submitting}
                className="flex-1 py-3 rounded-2xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60 transition-colors"
              >
                {submitting ? 'Validation…' : 'Confirmer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal demande de réouverture ─────────────────────── */}
      {showUnlockModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 animate-fade-in">
          <div className="bg-white rounded-3xl shadow-2xl p-6 w-full max-w-sm">
            <div className="w-12 h-12 bg-amber-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Send className="w-6 h-6 text-amber-600" />
            </div>
            <h3 className="text-lg font-bold text-slate-800 text-center mb-2">Demander une modification</h3>
            <p className="text-sm text-slate-500 text-center mb-4">
              Expliquez pourquoi vous souhaitez modifier{' '}
              <strong className="text-slate-700">{format(currentDate, 'MMMM yyyy', { locale: fr })}</strong>.
            </p>
            <textarea
              value={unlockReason}
              onChange={(e) => setUnlockReason(e.target.value)}
              placeholder="Ex : Je me suis trompé sur mes jours de congé..."
              rows={3}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none mb-4"
            />
            <div className="flex gap-3">
              <button
                onClick={() => { setShowUnlockModal(false); setUnlockReason(''); }}
                className="flex-1 py-3 rounded-2xl border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50 transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={handleUnlockRequest}
                disabled={submitting || !unlockReason.trim()}
                className="flex-1 py-3 rounded-2xl bg-amber-500 text-white text-sm font-semibold hover:bg-amber-600 disabled:opacity-60 transition-colors"
              >
                {submitting ? 'Envoi…' : 'Envoyer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
