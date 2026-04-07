'use client';

import { useEffect, useState, useCallback } from 'react';
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

const STATUS_CONFIG: Record<AvailabilityStatus, { label: string; icon: string; bg: string; text: string; border: string }> = {
  available:   { label: 'Disponible',   icon: '✓', bg: '#DCFCE7', text: '#15803D', border: '#86EFAC' },
  preferred:   { label: 'Préféré',      icon: '★', bg: '#FEF9C3', text: '#A16207', border: '#FDE047' },
  unavailable: { label: 'Indisponible', icon: '✗', bg: '#FEE2E2', text: '#DC2626', border: '#FCA5A5' },
};

const CYCLE: (AvailabilityStatus | null)[] = [null, 'available', 'preferred', 'unavailable'];
const WEEK_DAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

export default function EmployeeAvailabilityPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [availabilities, setAvailabilities] = useState<Map<string, AvailabilityEntry>>(new Map());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  // État du mois
  const [monthState, setMonthState] = useState<MonthState>('editable');
  const [validationId, setValidationId] = useState<string | null>(null);
  const [unlockRequestId, setUnlockRequestId] = useState<string | null>(null);

  // Modals
  const [showValidateModal, setShowValidateModal] = useState(false);
  const [showUnlockModal, setShowUnlockModal] = useState(false);
  const [unlockReason, setUnlockReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const monthKey = format(currentDate, 'yyyy-MM');

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

  // Charger disponibilités + état de validation du mois
  const loadData = useCallback(async () => {
    if (!employeeId) return;
    setLoading(true);
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

    // Disponibilités
    const map = new Map<string, AvailabilityEntry>();
    (avails ?? []).forEach((row) => map.set(row.date, { date: row.date, status: row.status as AvailabilityStatus }));
    setAvailabilities(map);

    // État du mois
    if (validation?.id) {
      setValidationId(validation.id);
      if (unlockReq?.status === 'pending') {
        setMonthState('request_pending');
        setUnlockRequestId(unlockReq.id);
      } else if (unlockReq?.status === 'rejected') {
        setMonthState('request_rejected');
        setUnlockRequestId(unlockReq.id);
      } else {
        setMonthState('validated');
        setUnlockRequestId(null);
      }
    } else {
      setMonthState('editable');
      setValidationId(null);
      setUnlockRequestId(null);
    }

    setLoading(false);
  }, [employeeId, currentDate, monthKey]);

  useEffect(() => { loadData(); }, [loadData]);

  // Clic sur un jour (seulement si éditable)
  const handleDayClick = async (dateStr: string) => {
    if (!employeeId || monthState !== 'editable') return;
    if (isPast(parseISO(dateStr)) && dateStr !== format(new Date(), 'yyyy-MM-dd')) {
      toast.error('Impossible de modifier un jour passé');
      return;
    }

    setSaving(dateStr);
    const supabase = createClient();
    const current = availabilities.get(dateStr);
    const currentIndex = CYCLE.indexOf(current?.status ?? null);
    const nextStatus = CYCLE[(currentIndex + 1) % CYCLE.length];
    const newMap = new Map(availabilities);

    if (!nextStatus) {
      await supabase.from('availability_requests').delete()
        .eq('employee_id', employeeId).eq('date', dateStr);
      newMap.delete(dateStr);
    } else {
      await supabase.from('availability_requests').upsert(
        { employee_id: employeeId, date: dateStr, status: nextStatus },
        { onConflict: 'employee_id,date' }
      );
      newMap.set(dateStr, { date: dateStr, status: nextStatus });
    }
    setAvailabilities(newMap);
    setSaving(null);
  };

  // Valider le mois
  const handleValidate = async () => {
    if (!employeeId) return;
    setSubmitting(true);
    const supabase = createClient();
    const { error } = await supabase.from('availability_validations')
      .insert({ employee_id: employeeId, month_key: monthKey });
    if (error) {
      toast.error('Erreur lors de la validation');
    } else {
      toast.success('Mois validé avec succès !');
      setShowValidateModal(false);
      await loadData();
    }
    setSubmitting(false);
  };

  // Envoyer demande de réouverture
  const handleUnlockRequest = async () => {
    if (!employeeId || !unlockReason.trim()) return;
    setSubmitting(true);
    const supabase = createClient();
    const { error } = await supabase.from('availability_unlock_requests')
      .insert({ employee_id: employeeId, month_key: monthKey, reason: unlockReason.trim() });
    if (error) {
      toast.error('Erreur lors de l\'envoi');
    } else {
      toast.success('Demande envoyée à votre responsable');
      setShowUnlockModal(false);
      setUnlockReason('');
      await loadData();
    }
    setSubmitting(false);
  };

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startPad = (getDay(monthStart) + 6) % 7;

  const countByStatus = (s: AvailabilityStatus) => [...availabilities.values()].filter((a) => a.status === s).length;
  const isLocked = monthState !== 'editable';

  if (!loading && employeeId === null) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center px-4">
        <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mb-4">
          <AlertTriangle className="w-8 h-8 text-amber-500" />
        </div>
        <h2 className="text-lg font-bold text-slate-800 mb-2">Compte non lié</h2>
        <p className="text-slate-500 text-sm max-w-sm">Contactez votre responsable pour finaliser la configuration.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">

      {/* Bannière d'état du mois */}
      {monthState === 'validated' && (
        <div className="bg-green-50 border border-green-200 rounded-2xl p-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-green-100 rounded-xl flex items-center justify-center shrink-0">
              <CheckCircle className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm font-bold text-green-800">Mois validé</p>
              <p className="text-xs text-green-600">Vos disponibilités sont verrouillées pour ce mois.</p>
            </div>
          </div>
          <button
            onClick={() => setShowUnlockModal(true)}
            className="shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-green-700 bg-green-100 hover:bg-green-200 transition-colors"
          >
            <Send className="w-3.5 h-3.5" />
            Demander une modification
          </button>
        </div>
      )}

      {monthState === 'request_pending' && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center gap-3">
          <div className="w-9 h-9 bg-amber-100 rounded-xl flex items-center justify-center shrink-0">
            <Clock className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <p className="text-sm font-bold text-amber-800">Demande de modification envoyée</p>
            <p className="text-xs text-amber-600">En attente de validation par votre responsable.</p>
          </div>
        </div>
      )}

      {monthState === 'request_rejected' && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-red-100 rounded-xl flex items-center justify-center shrink-0">
              <XCircle className="w-5 h-5 text-red-500" />
            </div>
            <div>
              <p className="text-sm font-bold text-red-700">Demande refusée</p>
              <p className="text-xs text-red-500">Votre responsable a refusé la modification. Vous pouvez refaire une demande.</p>
            </div>
          </div>
          <button
            onClick={() => setShowUnlockModal(true)}
            className="shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-red-600 bg-red-100 hover:bg-red-200 transition-colors"
          >
            <Send className="w-3.5 h-3.5" />
            Nouvelle demande
          </button>
        </div>
      )}

      {/* Explication (uniquement si éditable) */}
      {monthState === 'editable' && (
        <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4">
          <p className="text-sm font-semibold text-indigo-800 mb-1">Comment indiquer vos disponibilités</p>
          <p className="text-xs text-indigo-600 leading-relaxed">Cliquez sur un jour pour changer son statut.</p>
          <div className="flex flex-wrap gap-3 mt-3">
            {Object.entries(STATUS_CONFIG).map(([status, cfg]) => (
              <div key={status} className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg border flex items-center justify-center text-xs font-bold"
                  style={{ backgroundColor: cfg.bg, borderColor: cfg.border, color: cfg.text }}>
                  {cfg.icon}
                </div>
                <span className="text-xs font-medium text-indigo-700">{cfg.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Résumé */}
      <div className="grid grid-cols-3 gap-3">
        {Object.entries(STATUS_CONFIG).map(([status, cfg]) => (
          <div key={status} className="rounded-2xl border p-3 text-center"
            style={{ backgroundColor: cfg.bg + '60', borderColor: cfg.border }}>
            <p className="text-xl font-bold" style={{ color: cfg.text }}>{countByStatus(status as AvailabilityStatus)}</p>
            <p className="text-[11px] font-semibold mt-0.5" style={{ color: cfg.text }}>{cfg.label}</p>
          </div>
        ))}
      </div>

      {/* Calendrier */}
      <div className={`bg-white rounded-2xl border overflow-hidden ${isLocked ? 'border-slate-200 opacity-90' : 'border-slate-100'}`}>
        {/* Navigation */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <button onClick={() => setCurrentDate((d) => addMonths(d, -1))}
            className="h-8 w-8 flex items-center justify-center rounded-xl hover:bg-slate-100 transition-colors">
            <ChevronLeft className="w-4 h-4 text-slate-500" />
          </button>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-slate-800 capitalize">
              {format(currentDate, 'MMMM yyyy', { locale: fr })}
            </h2>
            {isLocked && <Lock className="w-3.5 h-3.5 text-slate-400" />}
          </div>
          <button onClick={() => setCurrentDate((d) => addMonths(d, 1))}
            className="h-8 w-8 flex items-center justify-center rounded-xl hover:bg-slate-100 transition-colors">
            <ChevronRight className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        {/* Jours semaine */}
        <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50/50">
          {WEEK_DAYS.map((day) => (
            <div key={day} className="py-2 text-center text-[11px] font-bold text-slate-400 tracking-wide">{day}</div>
          ))}
        </div>

        {/* Grille */}
        {loading ? (
          <div className="h-64 flex items-center justify-center">
            <p className="text-sm text-slate-400">Chargement…</p>
          </div>
        ) : (
          <div className="grid grid-cols-7">
            {Array.from({ length: startPad }).map((_, i) => (
              <div key={`pad-${i}`} className="h-16 border-b border-r border-slate-50" />
            ))}
            {days.map((day) => {
              const dateStr = format(day, 'yyyy-MM-dd');
              const entry = availabilities.get(dateStr);
              const cfg = entry ? STATUS_CONFIG[entry.status] : null;
              const isCurrentDay = isToday(day);
              const isWE = getDay(day) === 0 || getDay(day) === 6;
              const isSaving = saving === dateStr;
              const isPastDay = isPast(parseISO(dateStr)) && dateStr !== format(new Date(), 'yyyy-MM-dd');

              return (
                <button
                  key={dateStr}
                  onClick={() => handleDayClick(dateStr)}
                  disabled={isSaving || isPastDay || isLocked}
                  className={`h-16 border-b border-r border-slate-100 p-1.5 flex flex-col items-center justify-start transition-all ${
                    isLocked ? 'cursor-not-allowed' :
                    isPastDay ? 'opacity-40 cursor-not-allowed' : 'hover:opacity-80 active:scale-95'
                  } ${isWE && !cfg ? 'bg-slate-50/50' : ''}`}
                  style={cfg ? { backgroundColor: cfg.bg } : {}}
                >
                  <span className={`text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full ${
                    isCurrentDay ? 'bg-indigo-600 text-white' : isWE ? 'text-slate-400' : 'text-slate-600'
                  }`}>
                    {format(day, 'd')}
                  </span>
                  {isSaving ? (
                    <span className="text-[10px] text-slate-400 mt-1">…</span>
                  ) : cfg ? (
                    <span className="text-base font-bold mt-0.5 leading-none" style={{ color: cfg.text }}>{cfg.icon}</span>
                  ) : null}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Bouton de validation (uniquement si éditable) */}
      {monthState === 'editable' && !loading && (
        <button
          onClick={() => setShowValidateModal(true)}
          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm transition-colors shadow-md shadow-indigo-200"
        >
          <CheckCircle className="w-4 h-4" />
          Valider mes disponibilités pour {format(currentDate, 'MMMM', { locale: fr })}
        </button>
      )}

      <p className="text-xs text-slate-400 text-center pb-2">
        {isLocked ? 'Ce mois est verrouillé. Contactez votre responsable pour modifier.' : 'Les jours passés ne peuvent pas être modifiés.'}
      </p>

      {/* Modal de confirmation de validation */}
      {showValidateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-3xl shadow-2xl p-6 w-full max-w-sm">
            <div className="w-12 h-12 bg-indigo-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Lock className="w-6 h-6 text-indigo-600" />
            </div>
            <h3 className="text-lg font-bold text-slate-800 text-center mb-2">Valider le mois ?</h3>
            <p className="text-sm text-slate-500 text-center leading-relaxed mb-6">
              Une fois validées, vos disponibilités pour <strong className="text-slate-700">{format(currentDate, 'MMMM yyyy', { locale: fr })}</strong> seront verrouillées. Pour les modifier, vous devrez en faire la demande à votre responsable.
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

      {/* Modal de demande de réouverture */}
      {showUnlockModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-3xl shadow-2xl p-6 w-full max-w-sm">
            <div className="w-12 h-12 bg-amber-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Send className="w-6 h-6 text-amber-600" />
            </div>
            <h3 className="text-lg font-bold text-slate-800 text-center mb-2">Demander une modification</h3>
            <p className="text-sm text-slate-500 text-center mb-4">
              Expliquez pourquoi vous souhaitez modifier vos disponibilités pour <strong className="text-slate-700">{format(currentDate, 'MMMM yyyy', { locale: fr })}</strong>.
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
