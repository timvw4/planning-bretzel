'use client';

import { Sidebar } from './Sidebar';
import { Toaster } from 'react-hot-toast';
import { useEffect, useState } from 'react';
import { usePlanningStore } from '@/lib/store';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Loader2 } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { POINTAGES_REVIEW_UPDATED_EVENT } from '@/lib/timePunches';

// Pages qui ne doivent PAS afficher la sidebar admin
// Note : '/employee' avec correspondance exacte ou '/employee/' pour éviter de matcher '/employees'
const isPublicRoute = (pathname: string) =>
  pathname === '/login' ||
  pathname === '/register' ||
  pathname === '/forgot-password' ||
  pathname === '/reset-password' ||
  pathname.startsWith('/auth') ||
  pathname === '/employee' ||
  pathname.startsWith('/employee/');

export function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAdminPage = !isPublicRoute(pathname);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const loadData = usePlanningStore((s) => s.loadData);
  const refreshAlerts = usePlanningStore((s) => s.refreshAlerts);
  const isLoading = usePlanningStore((s) => s.isLoading);

  useEffect(() => {
    // Charger les données Supabase uniquement sur les pages admin (alertes incluses dans loadData)
    if (!isAdminPage) return;
    void loadData();
  }, [isAdminPage, loadData]);

  useEffect(() => {
    if (!isAdminPage) return;

    const refresh = () => {
      if (document.visibilityState === 'hidden') return;
      void refreshAlerts();
    };

    const interval = setInterval(refresh, 90000);
    const onPointagesUpdated = () => refresh();
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener(POINTAGES_REVIEW_UPDATED_EVENT, onPointagesUpdated);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener(POINTAGES_REVIEW_UPDATED_EVENT, onPointagesUpdated);
    };
  }, [isAdminPage, refreshAlerts]);

  // Pages publiques (login, register, employee) → pas de sidebar, pas de chargement admin
  if (!isAdminPage) {
    return <>{children}</>;
  }

  // Écran de chargement pendant que les données arrivent depuis Supabase
  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center shadow-lg">
            <Loader2 className="w-6 h-6 text-white animate-spin" />
          </div>
          <div className="text-center">
            <p className="text-slate-700 font-semibold text-sm">Chargement du planning…</p>
            <p className="text-slate-400 text-xs mt-1">Connexion à la base de données</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={300}>
      <div className="min-h-screen bg-slate-50">
        <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed((v) => !v)} />
        <div
          className="min-h-screen flex flex-col transition-all duration-300"
          style={{ marginLeft: sidebarCollapsed ? 64 : 256 }}
        >
          <main className="flex-1">
            {children}
          </main>
        </div>
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 3500,
            style: {
              background: '#fff',
              color: '#1e293b',
              border: '1px solid #e2e8f0',
              borderRadius: '12px',
              boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
              fontSize: '13px',
              fontWeight: 500,
              padding: '12px 16px',
            },
            success: {
              iconTheme: { primary: '#10b981', secondary: '#fff' },
            },
            error: {
              iconTheme: { primary: '#ef4444', secondary: '#fff' },
            },
          }}
        />
      </div>
    </TooltipProvider>
  );
}
