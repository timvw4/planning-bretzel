'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval,
  getDay, addMonths, isToday, isWeekend,
} from 'date-fns';
import { fr } from 'date-fns/locale';
import {
  ChevronLeft, ChevronRight, Users, CheckCircle, Star, XCircle,
  Lock, Check, X, Clock, AlertCircle,
} from 'lucide-react';
import { Header } from '@/components/layout/Header';
import toast from 'react-hot-toast';

type AvailabilityStatus = 'available' | 'preferred' | 'unavailable';
type ViewTab = 'calendar' | 'requests';

interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  color: string;
}

interface AvailabilityEntry {
  employeeId: string;
  date: string;
  status: AvailabilityStatus;
}

interface UnlockRequest {
  id: string;
  employeeId: string;
  monthKey: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  requestedAt: string;
}

const STATUS_CONFIG: Record<AvailabilityStatus, { icon: React.ReactNode; bg: string; text: string; label: string }> = {
  available:   { icon: <CheckCircle className="w-3 h-3" />, bg: '#DCFCE7', text: '#15803D', label: 'Disponible' },
  preferred:   { icon: <Star className="w-3 h-3" />,        bg: '#FEF9C3', text: '#A16207', label: 'Préféré' },
  unavailable: { icon: <XCircle className="w-3 h-3" />,     bg: '#FEE2E2', text: '#DC2626', label: 'Indisponible' },
};

export default function AvailabilityAdminPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [availabilities, setAvailabilities] = useState<AvailabilityEntry[]>([]);
  const [validatedEmployeeIds, setValidatedEmployeeIds] = useState<Set<string>>(new Set());
  const [unlockRequests, setUnlockRequests] = useState<UnlockRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<ViewTab>('calendar');
  const [filterStatus, setFilterStatus] = useState<AvailabilityStatus | 'all'>('all');
  const [processingId, setProcessingId] = useState<string | null>(null);

  const monthKey = format(currentDate, 'yyyy-MM');

  const loadData = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const start = format(startOfMonth(currentDate), 'yyyy-MM-dd');
    const end = format(endOfMonth(currentDate), 'yyyy-MM-dd');

    const [{ data: emps }, { data: avails }, { data: validations }, { data: requests }] = await Promise.all([
      supabase.from('employees').select('id, first_name, last_name, color').eq('is_active', true).order('first_name'),
      supabase.from('availability_requests').select('employee_id, date, status').gte('date', start).lte('date', end),
      supabase.from('availability_validations').select('employee_id').eq('month_key', monthKey),
      supabase.from('availability_unlock_requests').select('id, employee_id, month_key, reason, status, requested_at')
        .eq('month_key', monthKey).order('requested_at', { ascending: false }),
    ]);

    setEmployees((emps ?? []).map((e) => ({ id: e.id, firstName: e.first_name, lastName: e.last_name ?? '', color: e.color })));
    setAvailabilities((avails ?? []).map((a) => ({ employeeId: a.employee_id, date: a.date, status: a.status as AvailabilityStatus })));
    setValidatedEmployeeIds(new Set((validations ?? []).map((v) => v.employee_id)));
    setUnlockRequests((requests ?? []).map((r) => ({
      id: r.id, employeeId: r.employee_id, monthKey: r.month_key,
      reason: r.reason, status: r.status as UnlockRequest['status'],
      requestedAt: r.requested_at,
    })));
    setLoading(false);
  }, [currentDate, monthKey]);

  useEffect(() => { loadData(); }, [loadData]);

  // Approuver une demande → supprimer la validation + marquer approuvée
  const handleApprove = async (request: UnlockRequest) => {
    setProcessingId(request.id);
    const supabase = createClient();
    await Promise.all([
      supabase.from('availability_validations').delete()
        .eq('employee_id', request.employeeId).eq('month_key', request.monthKey),
      supabase.from('availability_unlock_requests').update({
        status: 'approved', reviewed_at: new Date().toISOString(),
      }).eq('id', request.id),
    ]);
    toast.success('Demande approuvée — le mois est déverrouillé');
    await loadData();
    setProcessingId(null);
  };

  // Rejeter une demande
  const handleReject = async (request: UnlockRequest) => {
    setProcessingId(request.id);
    const supabase = createClient();
    await supabase.from('availability_unlock_requests').update({
      status: 'rejected', reviewed_at: new Date().toISOString(),
    }).eq('id', request.id);
    toast.success('Demande refusée');
    await loadData();
    setProcessingId(null);
  };

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

  const availMap = new Map<string, Map<string, AvailabilityStatus>>();
  availabilities.forEach((a) => {
    if (!availMap.has(a.employeeId)) availMap.set(a.employeeId, new Map());
    availMap.get(a.employeeId)!.set(a.date, a.status);
  });

  const totalSubmitted = new Set(availabilities.map((a) => a.employeeId)).size;
  const totalValidated = validatedEmployeeIds.size;
  const totalAvailable = availabilities.filter((a) => a.status === 'available').length;
  const totalUnavailable = availabilities.filter((a) => a.status === 'unavailable').length;
  const pendingRequests = unlockRequests.filter((r) => r.status === 'pending');

  const filteredEmployees = filterStatus === 'all'
    ? employees
    : employees.filter((e) => {
        const empMap = availMap.get(e.id);
        if (!empMap) return false;
        return [...empMap.values()].some((s) => s === filterStatus);
      });

  const employeesWithNoData = employees.filter((e) => !availMap.has(e.id));

  const getEmployeeName = (id: string) => {
    const emp = employees.find((e) => e.id === id);
    return emp ? `${emp.firstName} ${emp.lastName}`.trim() : 'Inconnu';
  };

  return (
    <div className="flex flex-col h-screen">
      <Header
        title="Disponibilités"
        subtitle={`${totalSubmitted} soumission${totalSubmitted > 1 ? 's' : ''} · ${totalValidated} validé${totalValidated > 1 ? 's' : ''} · ${pendingRequests.length} demande${pendingRequests.length > 1 ? 's' : ''} en attente`}
      />

      <div className="flex-1 overflow-auto p-6 space-y-5">

        {/* Stats */}
        <div className="grid grid-cols-5 gap-4">
          <div className="bg-white rounded-2xl border border-slate-100 p-4">
            <div className="flex items-center gap-2 mb-2"><Users className="w-4 h-4 text-slate-400" />
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Soumissions</span></div>
            <p className="text-2xl font-bold text-slate-800">{totalSubmitted}<span className="text-sm text-slate-400 font-normal">/{employees.length}</span></p>
            <p className="text-xs text-slate-400 mt-0.5">employés ce mois</p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-100 p-4">
            <div className="flex items-center gap-2 mb-2"><Lock className="w-4 h-4 text-indigo-400" />
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Validés</span></div>
            <p className="text-2xl font-bold text-indigo-600">{totalValidated}<span className="text-sm text-slate-400 font-normal">/{employees.length}</span></p>
            <p className="text-xs text-slate-400 mt-0.5">mois verrouillés</p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-100 p-4">
            <div className="flex items-center gap-2 mb-2"><CheckCircle className="w-4 h-4 text-green-500" />
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Disponibles</span></div>
            <p className="text-2xl font-bold text-green-600">{totalAvailable}</p>
            <p className="text-xs text-slate-400 mt-0.5">jours renseignés</p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-100 p-4">
            <div className="flex items-center gap-2 mb-2"><XCircle className="w-4 h-4 text-red-400" />
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Indisponibles</span></div>
            <p className="text-2xl font-bold text-red-500">{totalUnavailable}</p>
            <p className="text-xs text-slate-400 mt-0.5">jours bloqués</p>
          </div>
          <div className={`rounded-2xl border p-4 ${pendingRequests.length > 0 ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-100'}`}>
            <div className="flex items-center gap-2 mb-2">
              <AlertCircle className={`w-4 h-4 ${pendingRequests.length > 0 ? 'text-amber-500' : 'text-slate-400'}`} />
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Demandes</span>
            </div>
            <p className={`text-2xl font-bold ${pendingRequests.length > 0 ? 'text-amber-600' : 'text-slate-400'}`}>{pendingRequests.length}</p>
            <p className="text-xs text-slate-400 mt-0.5">en attente</p>
          </div>
        </div>

        {/* Onglets */}
        <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1 w-fit">
          <button
            onClick={() => setActiveTab('calendar')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${activeTab === 'calendar' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            Calendrier
          </button>
          <button
            onClick={() => setActiveTab('requests')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${activeTab === 'requests' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            Demandes de modification
            {pendingRequests.length > 0 && (
              <span className="bg-amber-500 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5 leading-none">
                {pendingRequests.length}
              </span>
            )}
          </button>
        </div>

        {/* Vue calendrier */}
        {activeTab === 'calendar' && (
          <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <button onClick={() => setCurrentDate((d) => addMonths(d, -1))}
                  className="h-8 w-8 flex items-center justify-center rounded-xl hover:bg-slate-100 transition-colors">
                  <ChevronLeft className="w-4 h-4 text-slate-500" />
                </button>
                <h2 className="text-sm font-bold text-slate-800 capitalize w-36 text-center">
                  {format(currentDate, 'MMMM yyyy', { locale: fr })}
                </h2>
                <button onClick={() => setCurrentDate((d) => addMonths(d, 1))}
                  className="h-8 w-8 flex items-center justify-center rounded-xl hover:bg-slate-100 transition-colors">
                  <ChevronRight className="w-4 h-4 text-slate-500" />
                </button>
              </div>
              <div className="flex items-center gap-1.5">
                {(['all', 'available', 'preferred', 'unavailable'] as const).map((s) => (
                  <button key={s} onClick={() => setFilterStatus(s)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${filterStatus === s ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
                    {s === 'all' ? 'Tous' : STATUS_CONFIG[s].label}
                  </button>
                ))}
              </div>
            </div>

            {loading ? (
              <div className="h-40 flex items-center justify-center">
                <p className="text-sm text-slate-400">Chargement…</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse" style={{ minWidth: `${220 + days.length * 36}px` }}>
                  <thead>
                    <tr className="bg-slate-50/80">
                      <th className="sticky left-0 z-10 bg-slate-50/80 text-left px-4 py-2.5 text-xs font-bold text-slate-500 uppercase tracking-wide border-b border-r border-slate-100 w-48">
                        Employé
                      </th>
                      {days.map((day) => {
                        const isWE = isWeekend(day);
                        const isCurrent = isToday(day);
                        return (
                          <th key={format(day, 'yyyy-MM-dd')}
                            className={`w-9 text-center border-b border-r border-slate-100 py-1 ${isWE ? 'bg-slate-100/80' : ''}`}>
                            <div className="text-[10px] font-semibold text-slate-400">
                              {format(day, 'EEE', { locale: fr }).slice(0, 2)}
                            </div>
                            <div className={`text-xs font-bold mx-auto w-6 h-6 flex items-center justify-center rounded-full ${isCurrent ? 'bg-indigo-600 text-white' : isWE ? 'text-slate-400' : 'text-slate-600'}`}>
                              {format(day, 'd')}
                            </div>
                          </th>
                        );
                      })}
                      <th className="sticky right-0 bg-slate-50/80 px-3 py-2.5 text-xs font-bold text-slate-500 uppercase tracking-wide border-b border-l border-slate-100 w-24 text-center">
                        Résumé
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEmployees.map((emp) => {
                      const empMap = availMap.get(emp.id) ?? new Map<string, AvailabilityStatus>();
                      const isValidated = validatedEmployeeIds.has(emp.id);
                      const availCount = [...empMap.values()].filter((s) => s === 'available').length;
                      const unavailCount = [...empMap.values()].filter((s) => s === 'unavailable').length;
                      const preferredCount = [...empMap.values()].filter((s) => s === 'preferred').length;

                      return (
                        <tr key={emp.id} className="hover:bg-slate-50/50 transition-colors group">
                          <td className="sticky left-0 z-10 bg-white group-hover:bg-slate-50/50 px-4 py-2 border-b border-r border-slate-100">
                            <div className="flex items-center gap-2.5">
                              <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                                style={{ backgroundColor: emp.color }}>
                                {emp.firstName[0]}{emp.lastName[0]}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-semibold text-slate-700 truncate">{emp.firstName} {emp.lastName}</p>
                              </div>
                              {isValidated && (
                                <span className="shrink-0 flex items-center gap-1 text-[10px] font-bold text-indigo-600 bg-indigo-50 rounded-full px-2 py-0.5">
                                  <Lock className="w-2.5 h-2.5" /> Validé
                                </span>
                              )}
                            </div>
                          </td>
                          {days.map((day) => {
                            const dateStr = format(day, 'yyyy-MM-dd');
                            const status = empMap.get(dateStr);
                            const cfg = status ? STATUS_CONFIG[status] : null;
                            const isWE = isWeekend(day);
                            return (
                              <td key={dateStr}
                                className={`w-9 h-9 border-b border-r border-slate-100 text-center ${isWE ? 'bg-slate-50/50' : ''}`}
                                style={cfg ? { backgroundColor: cfg.bg } : {}}>
                                {cfg && (
                                  <div className="flex items-center justify-center h-full" style={{ color: cfg.text }}>
                                    {cfg.icon}
                                  </div>
                                )}
                              </td>
                            );
                          })}
                          <td className="sticky right-0 bg-white group-hover:bg-slate-50/50 border-b border-l border-slate-100 px-2 py-1">
                            {empMap.size > 0 ? (
                              <div className="flex flex-col gap-0.5 items-center">
                                {availCount > 0 && <span className="text-[10px] font-bold text-green-600">{availCount}✓</span>}
                                {preferredCount > 0 && <span className="text-[10px] font-bold text-yellow-600">{preferredCount}★</span>}
                                {unavailCount > 0 && <span className="text-[10px] font-bold text-red-500">{unavailCount}✗</span>}
                              </div>
                            ) : (
                              <span className="text-[10px] text-slate-300 block text-center">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Vue demandes */}
        {activeTab === 'requests' && (
          <div className="space-y-3">
            {unlockRequests.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-100 p-12 text-center">
                <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <Check className="w-6 h-6 text-slate-400" />
                </div>
                <p className="text-sm font-semibold text-slate-600">Aucune demande pour ce mois</p>
                <p className="text-xs text-slate-400 mt-1">Les demandes de modification apparaîtront ici.</p>
              </div>
            ) : (
              unlockRequests.map((req) => {
                const emp = employees.find((e) => e.id === req.employeeId);
                return (
                  <div key={req.id}
                    className={`bg-white rounded-2xl border p-5 flex items-start gap-4 ${req.status === 'pending' ? 'border-amber-200 bg-amber-50/30' : req.status === 'approved' ? 'border-green-200 bg-green-50/30' : 'border-red-200 bg-red-50/20'}`}>
                    {/* Avatar employé */}
                    <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0"
                      style={{ backgroundColor: emp?.color ?? '#6366F1' }}>
                      {emp?.firstName[0]}{emp?.lastName[0]}
                    </div>

                    {/* Infos */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-sm font-bold text-slate-800">{getEmployeeName(req.employeeId)}</span>
                        <span className="text-xs text-slate-400">·</span>
                        <span className="text-xs font-semibold text-slate-500 capitalize">
                          {format(new Date(req.monthKey + '-01'), 'MMMM yyyy', { locale: fr })}
                        </span>
                        {/* Badge statut */}
                        {req.status === 'pending' && (
                          <span className="flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-100 rounded-full px-2 py-0.5">
                            <Clock className="w-2.5 h-2.5" /> En attente
                          </span>
                        )}
                        {req.status === 'approved' && (
                          <span className="flex items-center gap-1 text-[10px] font-bold text-green-700 bg-green-100 rounded-full px-2 py-0.5">
                            <Check className="w-2.5 h-2.5" /> Approuvée
                          </span>
                        )}
                        {req.status === 'rejected' && (
                          <span className="flex items-center gap-1 text-[10px] font-bold text-red-600 bg-red-100 rounded-full px-2 py-0.5">
                            <X className="w-2.5 h-2.5" /> Refusée
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-slate-600 leading-relaxed bg-white/80 rounded-xl px-3 py-2 border border-slate-100 mt-2">
                        &ldquo;{req.reason}&rdquo;
                      </p>
                      <p className="text-[11px] text-slate-400 mt-2">
                        Envoyée le {format(new Date(req.requestedAt), 'd MMM yyyy à HH:mm', { locale: fr })}
                      </p>
                    </div>

                    {/* Actions (uniquement si pending) */}
                    {req.status === 'pending' && (
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => handleReject(req)}
                          disabled={processingId === req.id}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 disabled:opacity-60 transition-colors"
                        >
                          <X className="w-3.5 h-3.5" />
                          Refuser
                        </button>
                        <button
                          onClick={() => handleApprove(req)}
                          disabled={processingId === req.id}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-green-700 bg-green-100 hover:bg-green-200 disabled:opacity-60 transition-colors"
                        >
                          <Check className="w-3.5 h-3.5" />
                          {processingId === req.id ? '…' : 'Approuver'}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* Employés sans saisie */}
        {activeTab === 'calendar' && employeesWithNoData.length > 0 && (
          <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4">
            <p className="text-xs font-bold text-amber-700 mb-2">
              {employeesWithNoData.length} employé{employeesWithNoData.length > 1 ? 's' : ''} sans disponibilités ce mois
            </p>
            <div className="flex flex-wrap gap-2">
              {employeesWithNoData.map((emp) => (
                <div key={emp.id} className="flex items-center gap-1.5 bg-white rounded-xl px-2.5 py-1.5 border border-amber-100">
                  <div className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold text-white" style={{ backgroundColor: emp.color }}>
                    {emp.firstName[0]}
                  </div>
                  <span className="text-xs text-slate-600 font-medium">{emp.firstName} {emp.lastName}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Légende */}
        {activeTab === 'calendar' && (
          <div className="flex items-center gap-4 px-1">
            {Object.entries(STATUS_CONFIG).map(([status, cfg]) => (
              <div key={status} className="flex items-center gap-1.5">
                <div className="w-5 h-5 rounded-md flex items-center justify-center" style={{ backgroundColor: cfg.bg, color: cfg.text }}>
                  {cfg.icon}
                </div>
                <span className="text-xs text-slate-500">{cfg.label}</span>
              </div>
            ))}
            <div className="flex items-center gap-1.5">
              <span className="flex items-center gap-1 text-[10px] font-bold text-indigo-600 bg-indigo-50 rounded-full px-2 py-0.5">
                <Lock className="w-2.5 h-2.5" /> Validé
              </span>
              <span className="text-xs text-slate-500">Mois verrouillé par l&apos;employé</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
