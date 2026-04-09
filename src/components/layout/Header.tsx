'use client';

import { Bell, AlertTriangle, AlertCircle, Info, Check, CheckCheck, X } from 'lucide-react';
import { usePlanningStore } from '@/lib/store';
import { useShallow } from 'zustand/react/shallow';
import { formatDate } from '@/lib/utils';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useState, useRef, useEffect } from 'react';
import { PlanningAlert } from '@/lib/types';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { createClient } from '@/lib/supabase/client';

interface HeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

// ── Icône et couleurs selon la sévérité ──────────────────────
function AlertIcon({ severity }: { severity: PlanningAlert['severity'] }) {
  if (severity === 'error')
    return <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />;
  if (severity === 'warning')
    return <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />;
  return <Info className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />;
}

const SEVERITY_LABEL: Record<PlanningAlert['severity'], string> = {
  error: 'Erreur',
  warning: 'Avertissement',
  info: 'Info',
};

const SEVERITY_BG: Record<PlanningAlert['severity'], string> = {
  error: 'bg-red-50 border-red-100',
  warning: 'bg-amber-50 border-amber-100',
  info: 'bg-blue-50 border-blue-100',
};

export function Header({ title, subtitle, actions }: HeaderProps) {
  const { alerts, resolveAlert, employees } = usePlanningStore(
    useShallow((s) => ({
      alerts: s.alerts,
      resolveAlert: s.resolveAlert,
      employees: s.employees,
    }))
  );
  const [initials, setInitials] = useState('?');

  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => {
      const email = data.user?.email ?? '';
      const name = data.user?.user_metadata?.full_name as string | undefined;
      if (name) {
        const parts = name.trim().split(' ');
        setInitials(
          parts.length >= 2
            ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
            : parts[0].slice(0, 2).toUpperCase()
        );
      } else {
        setInitials(email.slice(0, 2).toUpperCase());
      }
    });
  }, []);
  const activeAlerts = alerts.filter((a) => !a.resolved);
  const resolvedAlerts = alerts.filter((a) => a.resolved);
  const today = new Date();

  const [open, setOpen] = useState(false);
  const [showResolved, setShowResolved] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Fermer si clic en dehors
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleResolveAll = () => {
    activeAlerts.forEach((a) => resolveAlert(a.id));
  };

  const getEmployeeName = (employeeId?: string) => {
    if (!employeeId) return null;
    const emp = employees.find((e) => e.id === employeeId);
    return emp ? `${emp.firstName}${emp.lastName ? ' ' + emp.lastName : ''}` : null;
  };

  const displayedAlerts = showResolved ? resolvedAlerts : activeAlerts;

  return (
    // z-40 : au-dessus du tableau (thead z-20 / coin z-30) pour que le panneau cloche ne soit pas recouvert
    <header className="sticky top-0 z-40 h-16 bg-white border-b border-slate-100 flex items-center justify-between px-6">
      {/* Titre de la page */}
      <div>
        <h1 className="text-lg font-semibold text-slate-900 leading-tight">{title}</h1>
        {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
      </div>

      {/* Actions et contrôles */}
      <div className="flex items-center gap-3">
        {/* Date du jour */}
        <div className="hidden md:flex items-center gap-2 text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-1.5">
          <span className="font-medium text-slate-700 capitalize">{formatDate(today, 'EEEE d MMMM yyyy')}</span>
        </div>

        {/* Actions passées en prop */}
        {actions && <div className="flex items-center gap-2">{actions}</div>}

        {/* Bouton cloche */}
        <div className="relative">
          <button
            ref={buttonRef}
            onClick={() => setOpen((v) => !v)}
            className={`relative h-9 w-9 flex items-center justify-center rounded-lg transition-colors ${
              open
                ? 'bg-indigo-50 text-indigo-600'
                : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
            }`}
          >
            <Bell className="h-4 w-4" />
            {activeAlerts.length > 0 && (
              <span className="absolute top-1.5 right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white leading-none">
                {activeAlerts.length > 9 ? '9+' : activeAlerts.length}
              </span>
            )}
          </button>

          {/* Panneau de notifications */}
          {open && (
            <div
              ref={panelRef}
              className="absolute right-0 top-11 w-80 bg-white rounded-2xl shadow-xl border border-slate-100 z-50 flex flex-col overflow-hidden"
              style={{ maxHeight: '480px' }}
            >
              {/* En-tête du panneau */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <Bell className="h-4 w-4 text-slate-600" />
                  <span className="text-sm font-semibold text-slate-800">Alertes planning</span>
                  {activeAlerts.length > 0 && (
                    <span className="text-[10px] font-bold text-white bg-red-500 rounded-full px-1.5 py-0.5 leading-none">
                      {activeAlerts.length}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => setOpen(false)}
                  className="h-6 w-6 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Onglets Actives / Résolues */}
              <div className="flex border-b border-slate-100">
                <button
                  onClick={() => setShowResolved(false)}
                  className={`flex-1 py-2 text-xs font-semibold transition-colors ${
                    !showResolved
                      ? 'text-indigo-600 border-b-2 border-indigo-500'
                      : 'text-slate-400 hover:text-slate-600'
                  }`}
                >
                  Actives ({activeAlerts.length})
                </button>
                <button
                  onClick={() => setShowResolved(true)}
                  className={`flex-1 py-2 text-xs font-semibold transition-colors ${
                    showResolved
                      ? 'text-indigo-600 border-b-2 border-indigo-500'
                      : 'text-slate-400 hover:text-slate-600'
                  }`}
                >
                  Résolues ({resolvedAlerts.length})
                </button>
              </div>

              {/* Liste des alertes */}
              <div className="overflow-y-auto flex-1">
                {displayedAlerts.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
                    <div className="w-10 h-10 rounded-full bg-green-50 flex items-center justify-center mb-3">
                      <Check className="h-5 w-5 text-green-500" />
                    </div>
                    <p className="text-sm font-medium text-slate-600">
                      {showResolved ? 'Aucune alerte résolue' : 'Aucune alerte active'}
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      {showResolved ? '' : 'Le planning est en ordre.'}
                    </p>
                  </div>
                ) : (
                  <div className="p-2 flex flex-col gap-1.5">
                    {displayedAlerts.map((alert) => {
                      const empName = getEmployeeName(alert.employeeId);
                      const dateLabel = alert.date
                        ? format(parseISO(alert.date), 'd MMM', { locale: fr })
                        : null;
                      return (
                        <div
                          key={alert.id}
                          className={`flex items-start gap-2.5 rounded-xl border p-3 ${SEVERITY_BG[alert.severity]}`}
                        >
                          <AlertIcon severity={alert.severity} />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-slate-700 leading-snug">{alert.message}</p>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              {empName && (
                                <span className="text-[10px] font-medium text-slate-500">{empName}</span>
                              )}
                              {dateLabel && (
                                <span className="text-[10px] text-slate-400">{dateLabel}</span>
                              )}
                              <span className={`text-[10px] font-semibold ${
                                alert.severity === 'error' ? 'text-red-500' :
                                alert.severity === 'warning' ? 'text-amber-500' : 'text-blue-500'
                              }`}>
                                {SEVERITY_LABEL[alert.severity]}
                              </span>
                            </div>
                          </div>
                          {!alert.resolved && (
                            <button
                              onClick={() => resolveAlert(alert.id)}
                              title="Marquer comme résolue"
                              className="shrink-0 h-6 w-6 flex items-center justify-center rounded-md text-slate-300 hover:text-green-500 hover:bg-white transition-colors"
                            >
                              <Check className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Pied : tout résoudre */}
              {!showResolved && activeAlerts.length > 0 && (
                <div className="border-t border-slate-100 px-4 py-3">
                  <button
                    onClick={handleResolveAll}
                    className="flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-green-600 transition-colors w-full justify-center"
                  >
                    <CheckCheck className="h-3.5 w-3.5" />
                    Tout marquer comme résolu
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Avatar utilisateur */}
        <Avatar className="h-8 w-8">
          <AvatarFallback className="bg-indigo-600 text-white text-xs font-bold">
            {initials}
          </AvatarFallback>
        </Avatar>
      </div>
    </header>
  );
}
