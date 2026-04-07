'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  Clock,
  CalendarDays,
  CalendarRange,
  Settings,
  ChevronRight,
  Zap,
  ShieldCheck,
  LogOut,
  CalendarCheck,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePlanningStore } from '@/lib/store';
import { createClient } from '@/lib/supabase/client';
import { useEffect, useState } from 'react';

const navigation = [
  {
    label: 'Vue d\'ensemble',
    items: [
      { name: 'Dashboard', href: '/', icon: LayoutDashboard },
    ],
  },
  {
    label: 'Planning',
    items: [
      { name: 'Vue mensuelle', href: '/planning/monthly', icon: CalendarDays },
      { name: 'Vue hebdomadaire', href: '/planning/weekly', icon: CalendarRange },
    ],
  },
  {
    label: 'Gestion',
    items: [
      { name: 'Employés', href: '/employees', icon: Users },
      { name: 'Shifts', href: '/shifts', icon: Clock },
      { name: 'Disponibilités', href: '/availability', icon: CalendarCheck },
      { name: 'Validation', href: '/validation', icon: ShieldCheck },
    ],
  },
  {
    label: 'Configuration',
    items: [
      { name: 'Paramètres', href: '/settings', icon: Settings },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { alerts, settings } = usePlanningStore();
  const activeAlerts = alerts.filter((a) => !a.resolved);
  const [pendingUnlockCount, setPendingUnlockCount] = useState(0);

  // Compter les demandes de modification en attente
  useEffect(() => {
    const supabase = createClient();
    const fetchPending = async () => {
      const { count } = await supabase
        .from('availability_unlock_requests')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending');
      setPendingUnlockCount(count ?? 0);
    };
    fetchPending();
    // Rafraîchir toutes les 60 secondes
    const interval = setInterval(fetchPending, 60000);
    return () => clearInterval(interval);
  }, []);

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  return (
    <aside className="fixed left-0 top-0 h-full w-64 bg-white border-r border-slate-100 flex flex-col z-30">
      {/* Logo / Brand */}
      <div className="flex items-center gap-3 px-6 py-5 border-b border-slate-100">
        <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center shadow-sm">
          <Zap className="w-4 h-4 text-white" />
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-900">{settings.companyName}</p>
          <p className="text-xs text-slate-400">Gestion du planning</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
        {navigation.map((group) => (
          <div key={group.label}>
            <p className="px-3 text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-1">
              {group.label}
            </p>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const isActive = pathname === item.href;
                const showBadge = item.href === '/' && activeAlerts.length > 0;
                const showAvailBadge = item.href === '/availability' && pendingUnlockCount > 0;

                return (
                  <li key={item.name}>
                    <Link
                      href={item.href}
                      className={cn(
                        'group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150',
                        isActive
                          ? 'bg-indigo-50 text-indigo-700'
                          : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                      )}
                    >
                      <item.icon
                        className={cn(
                          'h-4 w-4 shrink-0 transition-colors',
                          isActive ? 'text-indigo-600' : 'text-slate-400 group-hover:text-slate-600'
                        )}
                      />
                      <span className="flex-1">{item.name}</span>
                      {showBadge && (
                        <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-semibold text-white">
                          {activeAlerts.length}
                        </span>
                      )}
                      {showAvailBadge && (
                        <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1.5 text-[10px] font-semibold text-white">
                          {pendingUnlockCount}
                        </span>
                      )}
                      {isActive && (
                        <ChevronRight className="h-3.5 w-3.5 text-indigo-400" />
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-4 py-4 border-t border-slate-100 space-y-2">
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium text-slate-500 hover:bg-red-50 hover:text-red-600 transition-colors group"
        >
          <LogOut className="w-4 h-4 text-slate-400 group-hover:text-red-500 transition-colors" />
          Se déconnecter
        </button>
        <div className="rounded-lg bg-indigo-50 p-3">
          <p className="text-xs font-semibold text-indigo-700">Planning V1</p>
          <p className="text-xs text-indigo-500 mt-0.5">© 2026 Bretzel & Co</p>
        </div>
      </div>
    </aside>
  );
}
