'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Loader2, Calendar, ClipboardList, Clock, LogOut, Building2, History } from 'lucide-react';
import Link from 'next/link';
import { Toaster } from 'react-hot-toast';
import { GeolocationOnboardingDialog } from '@/components/employee/GeolocationOnboardingDialog';
import { hasCompletedGeoOnboarding, markGeoOnboardingComplete } from '@/lib/employeeGeolocationOnboarding';

export default function EmployeeLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [loading, setLoading] = useState(true);
  const [employeeName, setEmployeeName] = useState('');
  const [initials, setInitials] = useState('?');
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [showGeoOnboarding, setShowGeoOnboarding] = useState(false);

  // Enregistrement du Service Worker pour la PWA
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) {
        router.push('/login');
        return;
      }

      // Vérifier le rôle depuis la table profiles
      const { data: profile } = await supabase
        .from('profiles')
        .select('role, employee_id')
        .eq('id', data.user.id)
        .single();

      if (!profile) {
        router.push('/login');
        return;
      }

      // Les admins n'ont pas accès au portail employé — rediriger vers l'admin
      if (profile.role === 'admin') {
        router.push('/');
        return;
      }

      // Compte non lié à un employé
      if (!profile.employee_id) {
        setEmployeeName(data.user?.email ?? 'Employé');
        setInitials((data.user?.email ?? '?').slice(0, 2).toUpperCase());
        setLoading(false);
        return;
      }

      setEmployeeId(profile.employee_id);

      // Récupérer le nom de l'employé lié au compte
      if (profile.employee_id) {
        const { data: employee } = await supabase
          .from('employees')
          .select('first_name, last_name')
          .eq('id', profile.employee_id)
          .single();

        if (employee) {
          const name = `${employee.first_name}${employee.last_name ? ' ' + employee.last_name : ''}`;
          setEmployeeName(name);
          const parts = name.trim().split(' ');
          setInitials(
            parts.length >= 2
              ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
              : parts[0].slice(0, 2).toUpperCase()
          );
        }
      } else {
        const email = data.user.email ?? '';
        setEmployeeName(email);
        setInitials(email.slice(0, 2).toUpperCase());
      }

      setLoading(false);
    });
  }, [router]);

  // Demande de localisation une seule fois à la première ouverture (par employé / appareil)
  useEffect(() => {
    if (loading || !employeeId) return;
    if (hasCompletedGeoOnboarding(employeeId)) return;

    async function checkAndPrompt() {
      // Déjà autorisé dans le navigateur → pas besoin de redemander
      if (typeof navigator !== 'undefined' && navigator.permissions?.query) {
        try {
          const status = await navigator.permissions.query({
            name: 'geolocation' as PermissionName,
          });
          if (status.state === 'granted') {
            markGeoOnboardingComplete(employeeId!);
            return;
          }
        } catch {
          // Permissions API indisponible (ex. Safari) → afficher la fenêtre
        }
      }
      setShowGeoOnboarding(true);
    }

    void checkAndPrompt();
  }, [loading, employeeId]);

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center shadow-lg">
            <Loader2 className="w-6 h-6 text-white animate-spin" />
          </div>
          <p className="text-slate-500 text-sm">Chargement…</p>
        </div>
      </div>
    );
  }

  const navItems = [
    { href: '/employee', label: 'Mon planning', icon: Calendar },
    { href: '/employee/availability', label: 'Mes disponibilités', icon: ClipboardList },
    { href: '/employee/timesheets', label: 'Pointage', icon: Clock },
    { href: '/employee/historique', label: 'Historique', icon: History },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-100 sticky top-0 z-20">
        <div className="max-w-3xl mx-auto px-4 h-16 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-600 flex items-center justify-center shadow-sm">
              <Building2 className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-slate-800 text-sm">Mon Planning</span>
          </div>

          {/* Nav desktop */}
          <nav className="hidden md:flex items-center gap-1">
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-indigo-50 text-indigo-700'
                      : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <item.icon className="w-4 h-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {/* User + Logout */}
          <div className="flex items-center gap-3">
            <div className="hidden md:block text-right">
              <p className="text-sm font-semibold text-slate-800 leading-tight">{employeeName}</p>
              <p className="text-xs text-slate-400">Employé</p>
            </div>
            <div className="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs font-bold shrink-0">
              {initials}
            </div>
            <button
              onClick={handleLogout}
              title="Se déconnecter"
              className="h-8 w-8 flex items-center justify-center rounded-xl text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Nav mobile */}
        <div className="md:hidden border-t border-slate-100 flex">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex-1 flex flex-col items-center gap-1 py-2.5 text-[11px] font-semibold transition-colors relative ${
                  isActive ? 'text-indigo-600' : 'text-slate-400'
                }`}
              >
                {/* Barre indicatrice animée sur le lien actif */}
                {isActive && (
                  <span className="absolute top-0 left-1/4 right-1/4 h-0.5 rounded-full bg-indigo-600 animate-fade-in" />
                )}
                <item.icon className="w-4 h-4" />
                {item.label}
              </Link>
            );
          })}
        </div>
      </header>

      {/* Contenu — key={pathname} recrée le nœud à chaque changement de page → déclenche le fade */}
      <main className="max-w-3xl mx-auto px-4 py-6">
        <div key={pathname} className="animate-fade-in">
          {children}
        </div>
      </main>

      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: '#fff',
            color: '#1e293b',
            border: '1px solid #e2e8f0',
            borderRadius: '12px',
            fontSize: '13px',
          },
        }}
      />

      {employeeId && (
        <GeolocationOnboardingDialog
          open={showGeoOnboarding}
          employeeId={employeeId}
          onComplete={() => setShowGeoOnboarding(false)}
        />
      )}
    </div>
  );
}
