'use client';

import { useEffect, useState, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { format, parseISO, differenceInMinutes } from 'date-fns';
import { fr } from 'date-fns/locale';
import {
  Clock, CheckCircle2, XCircle,
  ChevronDown, ChevronUp, AlertCircle, RefreshCw,
  Coffee, UtensilsCrossed, AlertTriangle, ListChecks,
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

// ── Sync planning : heures validées → cases du planning (schedule_entries) ──

/** Après approbation admin : enregistre les heures réelles sur la ligne planning du jour. */
async function syncScheduleFromApprovedDeclaration(
  supabase: ReturnType<typeof createClient>,
  employeeId: string,
  date: string,
  actualStart: string,
  actualEnd: string
) {
  const { error } = await supabase
    .from('schedule_entries')
    .update({
      validated_start: actualStart,
      validated_end: actualEnd,
      is_modified: true,
    })
    .eq('employee_id', employeeId)
    .eq('date', date);
  if (error) console.error('syncScheduleFromApprovedDeclaration', error);
}

/** Après refus : retire les heures validées du planning pour ce jour (retour au modèle de shift). */
async function clearScheduleValidatedTimes(
  supabase: ReturnType<typeof createClient>,
  employeeId: string,
  date: string
) {
  const { error } = await supabase
    .from('schedule_entries')
    .update({
      validated_start: null,
      validated_end: null,
    })
    .eq('employee_id', employeeId)
    .eq('date', date);
  if (error) console.error('clearScheduleValidatedTimes', error);
}

// ── Types ────────────────────────────────────────────────────

type DeclStatus = 'pending' | 'approved' | 'rejected';

interface Declaration {
  id: string;
  employee_id: string;
  date: string;
  planned_start: string | null;
  planned_end: string | null;
  actual_start: string;
  actual_end: string;
  note: string | null;
  status: DeclStatus;
  admin_note: string | null;
  declared_at: string;
  pause_15min?: boolean;
  had_snack?: boolean;
  ate_work_food?: boolean;
  // jointure avec employees
  employees: { first_name: string; last_name: string | null; color: string | null } | null;
}

const STATUS_TABS: { key: DeclStatus | 'all'; label: string }[] = [
  { key: 'pending',  label: 'En attente' },
  { key: 'approved', label: 'Approuvées' },
  { key: 'rejected', label: 'Refusées' },
];

const TAB_STYLE: Record<DeclStatus, { row: string; badge: string }> = {
  pending:  { row: 'bg-white hover:bg-amber-50/40',  badge: 'bg-amber-50  text-amber-700  border-amber-200' },
  approved: { row: 'bg-white hover:bg-green-50/40',  badge: 'bg-green-50  text-green-700  border-green-200' },
  rejected: { row: 'bg-white hover:bg-red-50/40',    badge: 'bg-red-50    text-red-600    border-red-200'   },
};

// ── Utilitaires ──────────────────────────────────────────────

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function minutesToLabel(min: number): string {
  const h = Math.floor(Math.abs(min) / 60);
  const m = Math.abs(min) % 60;
  const sign = min < 0 ? '-' : '+';
  return `${sign}${h}h${m.toString().padStart(2, '0')}`;
}

function calcDiffMinutes(planned: string | null, actual: string): number | null {
  if (!planned) return null;
  return timeToMinutes(actual) - timeToMinutes(planned);
}

function initials(firstName: string, lastName: string | null): string {
  return (firstName[0] + (lastName?.[0] ?? '')).toUpperCase();
}

// ── Composant ligne déclaration ──────────────────────────────

interface DeclRowProps {
  decl: Declaration;
  onStatusChange: (id: string, status: DeclStatus, adminNote?: string) => void;
}

function DeclRow({ decl, onStatusChange }: DeclRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [rejectNote, setRejectNote] = useState('');
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [acting, setActing] = useState(false);

  const emp = decl.employees;
  const empName = emp ? `${emp.first_name}${emp.last_name ? ' ' + emp.last_name : ''}` : '—';
  const empInitials = emp ? initials(emp.first_name, emp.last_name) : '?';
  const empColor = emp?.color ?? '#6366f1';

  const startDiff = calcDiffMinutes(decl.planned_start, decl.actual_start);
  const endDiff   = calcDiffMinutes(decl.planned_end,   decl.actual_end);

  const actualDuration = differenceInMinutes(
    parseISO(`${decl.date}T${decl.actual_end}`),
    parseISO(`${decl.date}T${decl.actual_start}`)
  );
  const plannedDuration = decl.planned_start && decl.planned_end
    ? timeToMinutes(decl.planned_end) - timeToMinutes(decl.planned_start)
    : null;

  const pauseOk = decl.pause_15min ?? true;

  const handleApprove = async () => {
    setActing(true);
    const supabase = createClient();
    const { error } = await supabase
      .from('time_declarations')
      .update({ status: 'approved', admin_note: null, reviewed_at: new Date().toISOString() })
      .eq('id', decl.id);
    if (error) { toast.error('Erreur lors de l\'approbation'); setActing(false); return; }
    await syncScheduleFromApprovedDeclaration(
      supabase,
      decl.employee_id,
      decl.date,
      decl.actual_start,
      decl.actual_end
    );
    void usePlanningStore.getState().loadData();
    toast.success('Déclaration approuvée — planning mis à jour');
    onStatusChange(decl.id, 'approved');
    setActing(false);
  };

  const handleReject = async () => {
    if (!rejectNote.trim()) { toast.error('Veuillez saisir un motif de refus'); return; }
    setActing(true);
    const supabase = createClient();
    const { error } = await supabase
      .from('time_declarations')
      .update({ status: 'rejected', admin_note: rejectNote.trim(), reviewed_at: new Date().toISOString() })
      .eq('id', decl.id);
    if (error) { toast.error('Erreur lors du refus'); setActing(false); return; }
    await clearScheduleValidatedTimes(supabase, decl.employee_id, decl.date);
    void usePlanningStore.getState().loadData();
    toast.success('Déclaration refusée');
    onStatusChange(decl.id, 'rejected', rejectNote.trim());
    setShowRejectForm(false);
    setRejectNote('');
    setActing(false);
  };

  return (
    <div className={`rounded-2xl border border-slate-100 overflow-hidden transition-all duration-200 ${TAB_STYLE[decl.status].row}`}>
      {/* Ligne principale */}
      <div
        className="p-4 flex items-center gap-4 cursor-pointer select-none"
        onClick={() => setExpanded((v) => !v)}
      >
        {/* Avatar */}
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center text-white text-[11px] font-bold shrink-0"
          style={{ backgroundColor: empColor }}
        >
          {empInitials}
        </div>

        {/* Infos */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-slate-800">{empName}</p>
            <span className="text-xs text-slate-400">
              {format(parseISO(decl.date), 'EEEE d MMMM yyyy', { locale: fr })}
            </span>
          </div>
          {/* Heures */}
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            <div className="flex items-center gap-1.5 text-xs">
              <Clock className="w-3 h-3 text-slate-400" />
              <span className="font-bold text-slate-700">{decl.actual_start}</span>
              <span className="text-slate-400">→</span>
              <span className="font-bold text-slate-700">{decl.actual_end}</span>
              <span className="text-slate-400">
                ({Math.floor(actualDuration / 60)}h{(actualDuration % 60).toString().padStart(2, '0')})
              </span>
            </div>
            {/* Écart arrivée */}
            {startDiff !== null && startDiff !== 0 && (
              <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-lg border ${
                startDiff > 0 ? 'bg-amber-50 text-amber-600 border-amber-200' : 'bg-emerald-50 text-emerald-600 border-emerald-200'
              }`}>
                Arrivée {minutesToLabel(startDiff)}
              </span>
            )}
            {/* Écart départ */}
            {endDiff !== null && endDiff !== 0 && (
              <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-lg border ${
                endDiff < 0 ? 'bg-amber-50 text-amber-600 border-amber-200' : 'bg-slate-50 text-slate-500 border-slate-200'
              }`}>
                Départ {minutesToLabel(endDiff)}
              </span>
            )}
            {!pauseOk && (
              <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded-lg border bg-amber-50 text-amber-800 border-amber-300 flex items-center gap-0.5">
                <AlertTriangle className="w-3 h-3 shrink-0" />
                Pas de pause 15 min
              </span>
            )}
          </div>
        </div>

        {/* Statut + expand */}
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-[11px] font-semibold px-2 py-1 rounded-xl border hidden sm:flex items-center gap-1 ${TAB_STYLE[decl.status].badge}`}>
            {decl.status === 'pending'  && <Clock        className="w-3 h-3" />}
            {decl.status === 'approved' && <CheckCircle2 className="w-3 h-3" />}
            {decl.status === 'rejected' && <XCircle      className="w-3 h-3" />}
            {decl.status === 'pending' ? 'En attente' : decl.status === 'approved' ? 'Approuvé' : 'Refusé'}
          </span>
          {expanded
            ? <ChevronUp   className="w-4 h-4 text-slate-400" />
            : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </div>
      </div>

      {/* Panneau expandé */}
      {expanded && (
        <div className="border-t border-slate-100 px-4 pb-4 pt-3 space-y-3 animate-fade-in">
          {/* Détail prévu vs réel */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-50 rounded-xl p-3">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">Prévu</p>
              {decl.planned_start ? (
                <>
                  <p className="text-sm font-semibold text-slate-700">{decl.planned_start} – {decl.planned_end}</p>
                  {plannedDuration !== null && (
                    <p className="text-xs text-slate-400 mt-0.5">
                      {Math.floor(plannedDuration / 60)}h{(plannedDuration % 60).toString().padStart(2, '0')}
                    </p>
                  )}
                </>
              ) : (
                <p className="text-sm text-slate-400">Aucun shift planifié</p>
              )}
            </div>
            <div className="bg-indigo-50 rounded-xl p-3">
              <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-wide mb-1">Réel</p>
              <p className="text-sm font-semibold text-indigo-700">{decl.actual_start} – {decl.actual_end}</p>
              <p className="text-xs text-indigo-400 mt-0.5">
                {Math.floor(actualDuration / 60)}h{(actualDuration % 60).toString().padStart(2, '0')}
              </p>
            </div>
          </div>

          {/* Pause, collation, repas */}
          {!pauseOk && (
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-900">
                <strong>Attention :</strong> l’employé indique <strong>ne pas avoir pris</strong> une pause d’au moins 15 minutes dans la journée.
              </p>
            </div>
          )}
          <div className="bg-white border border-slate-200 rounded-xl px-3 py-3 space-y-2">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Déclarations journée</p>
            <div className="grid gap-1.5 text-sm">
              <div className="flex justify-between gap-4">
                <span className="text-slate-500">Pause ≥ 15 min</span>
                <span className={`font-semibold ${pauseOk ? 'text-emerald-700' : 'text-amber-700'}`}>
                  {pauseOk ? 'Oui' : 'Non'}
                </span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-slate-500 flex items-center gap-1.5">
                  <Coffee className="w-3.5 h-3.5 text-slate-400" /> Collation
                </span>
                <span className="font-semibold text-slate-800">{(decl.had_snack ?? false) ? 'Oui' : 'Non'}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-slate-500 flex items-center gap-1.5">
                  <UtensilsCrossed className="w-3.5 h-3.5 text-slate-400" /> Nourriture du travail
                </span>
                <span className="font-semibold text-slate-800">{(decl.ate_work_food ?? false) ? 'Oui' : 'Non'}</span>
              </div>
            </div>
          </div>

          {/* Note de l'employé */}
          {decl.note && (
            <div className="bg-amber-50 border border-amber-100 rounded-xl px-3 py-2.5">
              <p className="text-[10px] font-bold text-amber-500 uppercase tracking-wide mb-0.5">Note de l'employé</p>
              <p className="text-xs text-amber-700">« {decl.note} »</p>
            </div>
          )}

          {/* Note admin (si refusé) */}
          {decl.admin_note && (
            <div className="bg-red-50 border border-red-100 rounded-xl px-3 py-2.5">
              <p className="text-[10px] font-bold text-red-400 uppercase tracking-wide mb-0.5">Motif de refus</p>
              <p className="text-xs text-red-600">{decl.admin_note}</p>
            </div>
          )}

          {/* Date de déclaration */}
          <p className="text-[11px] text-slate-400">
            Déclaré le {format(parseISO(decl.declared_at), 'd MMMM yyyy à HH:mm', { locale: fr })}
          </p>

          {/* Actions (uniquement sur les déclarations en attente) */}
          {decl.status === 'pending' && (
            <div className="space-y-2 pt-1">
              {!showRejectForm ? (
                <div className="flex gap-2">
                  <button
                    onClick={handleApprove}
                    disabled={acting}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold transition-colors disabled:opacity-60"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    Approuver
                  </button>
                  <button
                    onClick={() => setShowRejectForm(true)}
                    disabled={acting}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 text-sm font-semibold transition-colors disabled:opacity-60"
                  >
                    <XCircle className="w-4 h-4" />
                    Refuser
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <input
                    type="text"
                    value={rejectNote}
                    onChange={(e) => setRejectNote(e.target.value)}
                    placeholder="Motif du refus (obligatoire)…"
                    className="w-full px-3 py-2.5 rounded-xl border border-red-200 text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-300"
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setShowRejectForm(false); setRejectNote(''); }}
                      className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50 transition-colors"
                    >
                      Annuler
                    </button>
                    <button
                      onClick={handleReject}
                      disabled={acting || !rejectNote.trim()}
                      className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold transition-colors disabled:opacity-60"
                    >
                      {acting ? 'Refus…' : 'Confirmer le refus'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Page principale ──────────────────────────────────────────

export default function AdminTimesheetsPage() {
  const [tab, setTab] = useState<DeclStatus>('pending');
  const [declarations, setDeclarations] = useState<Declaration[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [bulkApproving, setBulkApproving] = useState(false);

  const fetchAll = async (silent = false) => {
    if (!silent) setLoading(true); else setRefreshing(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from('time_declarations')
      .select('*, employees(first_name, last_name, color)')
      .order('date', { ascending: false });
    if (error) { toast.error('Erreur de chargement'); }
    else { setDeclarations((data ?? []) as Declaration[]); }
    if (!silent) setLoading(false); else setRefreshing(false);
  };

  useEffect(() => { void fetchAll(); }, []);

  const handleStatusChange = (id: string, status: DeclStatus, adminNote?: string) => {
    setDeclarations((prev) =>
      prev.map((d) => d.id === id ? { ...d, status, admin_note: adminNote ?? d.admin_note } : d)
    );
  };

  /** Approuve toutes les déclarations encore en attente (une seule requête). */
  const handleApproveAllPending = async () => {
    setBulkApproving(true);
    const supabase = createClient();
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('time_declarations')
      .update({ status: 'approved', admin_note: null, reviewed_at: now })
      .eq('status', 'pending')
      .select('employee_id, date, actual_start, actual_end');
    if (error) {
      toast.error('Erreur lors de l\'approbation groupée');
      setBulkApproving(false);
      return;
    }
    const n = data?.length ?? 0;
    if (data && n > 0) {
      for (const row of data) {
        await syncScheduleFromApprovedDeclaration(
          supabase,
          row.employee_id as string,
          row.date as string,
          row.actual_start as string,
          row.actual_end as string
        );
      }
      void usePlanningStore.getState().loadData();
    }
    if (n === 0) {
      toast('Aucune déclaration en attente');
    } else {
      toast.success(`${n} déclaration${n > 1 ? 's' : ''} approuvée${n > 1 ? 's' : ''} — planning mis à jour`);
    }
    setBulkDialogOpen(false);
    setBulkApproving(false);
    await fetchAll(true);
  };

  const filtered = useMemo(() => declarations.filter((d) => d.status === tab), [declarations, tab]);

  const counts = useMemo(() => ({
    pending:  declarations.filter((d) => d.status === 'pending').length,
    approved: declarations.filter((d) => d.status === 'approved').length,
    rejected: declarations.filter((d) => d.status === 'rejected').length,
  }), [declarations]);

  return (
    <div className="flex flex-col min-h-screen bg-slate-50">
      <Header
        title="Feuilles d'heures"
        subtitle="Vérifiez et approuvez les heures déclarées par vos employés"
      />

      <div className="flex-1 max-w-4xl mx-auto w-full p-6 space-y-5">

        {/* ── Onglets ──────────────────────────────────────── */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-1.5 bg-white border border-slate-100 rounded-2xl p-1.5 shadow-sm">
            {STATUS_TABS.map(({ key, label }) => {
              if (key === 'all') return null;
              const count = counts[key as DeclStatus];
              const isActive = tab === key;
              return (
                <button
                  key={key}
                  onClick={() => setTab(key as DeclStatus)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                    isActive
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                  }`}
                >
                  {label}
                  {count > 0 && (
                    <span className={`h-5 min-w-5 flex items-center justify-center rounded-full px-1.5 text-[10px] font-bold ${
                      isActive
                        ? 'bg-white/25 text-white'
                        : key === 'pending'
                        ? 'bg-amber-100 text-amber-700'
                        : key === 'approved'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-red-100 text-red-600'
                    }`}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {counts.pending > 0 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setBulkDialogOpen(true)}
                disabled={refreshing || bulkApproving}
                className="gap-1.5 border-emerald-200 text-emerald-800 hover:bg-emerald-50 hover:text-emerald-900"
              >
                <ListChecks className="h-4 w-4" />
                Tout approuver
                <span className="rounded-full bg-emerald-100 px-1.5 text-[10px] font-bold text-emerald-800">
                  {counts.pending}
                </span>
              </Button>
            )}
            <button
              type="button"
              onClick={() => fetchAll(true)}
              disabled={refreshing}
              className="h-9 w-9 flex items-center justify-center rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-400 transition-colors disabled:opacity-50"
              title="Rafraîchir"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* ── Contenu ──────────────────────────────────────── */}
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-white rounded-2xl border border-slate-100 p-4">
                <div className="flex items-center gap-4">
                  <div className="w-9 h-9 rounded-full animate-shimmer shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-40 rounded-full animate-shimmer" />
                    <div className="h-3 w-56 rounded-full animate-shimmer" />
                  </div>
                  <div className="h-7 w-24 rounded-xl animate-shimmer" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center animate-fade-in">
            <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
              {tab === 'pending'
                ? <AlertCircle className="w-8 h-8 text-slate-300" />
                : tab === 'approved'
                ? <CheckCircle2 className="w-8 h-8 text-slate-300" />
                : <XCircle className="w-8 h-8 text-slate-300" />}
            </div>
            <p className="text-sm font-semibold text-slate-500">
              {tab === 'pending'
                ? 'Aucune déclaration en attente'
                : tab === 'approved'
                ? 'Aucune déclaration approuvée'
                : 'Aucune déclaration refusée'}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              {tab === 'pending'
                ? 'Tout est à jour !'
                : 'Elles apparaîtront ici une fois traitées.'}
            </p>
          </div>
        ) : (
          <div className="space-y-3 animate-fade-in">
            {tab === 'pending' && (
              <p className="text-xs text-slate-400 px-1">
                {filtered.length} déclaration{filtered.length > 1 ? 's' : ''} en attente de validation — cliquez sur une ligne pour voir le détail et agir.
              </p>
            )}
            {filtered.map((decl) => (
              <DeclRow key={decl.id} decl={decl} onStatusChange={handleStatusChange} />
            ))}
          </div>
        )}
      </div>

      <Dialog open={bulkDialogOpen} onOpenChange={setBulkDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ListChecks className="h-5 w-5 text-emerald-600" />
              Approuver toutes les déclarations en attente ?
            </DialogTitle>
            <DialogDescription className="text-left leading-relaxed pt-1">
              Les <strong>{counts.pending}</strong> feuille{counts.pending > 1 ? 's' : ''} d&apos;heures encore au statut
              « En attente » seront marquées comme <strong>approuvées</strong>. Cette action ne peut pas être annulée
              automatiquement ; vous pourrez consulter l&apos;onglet « Approuvées ».
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setBulkDialogOpen(false)}
              disabled={bulkApproving}
            >
              Annuler
            </Button>
            <Button
              type="button"
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={() => void handleApproveAllPending()}
              disabled={bulkApproving}
            >
              {bulkApproving ? 'Approbation…' : `Confirmer (${counts.pending})`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
