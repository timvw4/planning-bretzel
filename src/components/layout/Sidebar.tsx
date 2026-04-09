'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  Clock,
  CalendarDays,
  CalendarRange,
  Settings,
  ChevronRight,
  ChevronLeft,
  ShieldCheck,
  LogOut,
  CalendarCheck,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePlanningStore } from '@/lib/store';
import { useShallow } from 'zustand/react/shallow';
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

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { alerts, settings } = usePlanningStore(
    useShallow((s) => ({ alerts: s.alerts, settings: s.settings }))
  );
  const activeAlerts = alerts.filter((a) => !a.resolved);
  const [pendingUnlockCount, setPendingUnlockCount] = useState(0);

  useEffect(() => {
    const supabase = createClient();
    const fetchPending = async () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      const { count } = await supabase
        .from('availability_unlock_requests')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending');
      setPendingUnlockCount(count ?? 0);
    };
    void fetchPending();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void fetchPending();
    };
    document.addEventListener('visibilitychange', onVisible);
    const interval = setInterval(fetchPending, 120000);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(interval);
    };
  }, []);

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 h-full bg-white border-r border-slate-100 flex flex-col z-30 transition-all duration-300',
        collapsed ? 'w-16' : 'w-64'
      )}
    >
      {/* Logo / Brand */}
      <div className={cn(
        'flex items-center border-b border-slate-100 transition-all duration-300',
        collapsed ? 'justify-center px-0 py-5' : 'gap-3 px-4 py-5'
      )}>
        {/* Pas d’ombre (shadow) : elle faisait un trait sombre en bas à droite. object-contain : le PNG a souvent du blanc autour du vert. */}
        <div className="w-12 h-12 rounded-xl overflow-hidden shrink-0 bg-white ring-1 ring-slate-200/60">
          <Image
            src="/icon-512.png"
            alt="Logo Bretzel"
            width={48}
            height={48}
            className="h-full w-full object-contain"
            priority
          />
        </div>
        {!collapsed && (
          <div className="overflow-hidden">
            <p className="text-sm font-semibold text-slate-900 truncate">{settings.companyName}</p>
            <p className="text-xs text-slate-400">Gestion du planning</p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden py-4 space-y-5">
        {navigation.map((group) => (
          <div key={group.label}>
            {/* Libellé de groupe — masqué si réduit */}
            {!collapsed && (
              <p className="px-4 text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-1">
                {group.label}
              </p>
            )}
            {collapsed && (
              <div className="mx-3 border-t border-slate-100 mb-1" />
            )}
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const isActive = pathname === item.href;
                const showBadge = item.href === '/' && activeAlerts.length > 0;
                const showAvailBadge = item.href === '/availability' && pendingUnlockCount > 0;
                const hasBadge = showBadge || showAvailBadge;
                const badgeCount = showBadge ? activeAlerts.length : pendingUnlockCount;
                const badgeColor = showBadge ? 'bg-red-500' : 'bg-amber-500';

                return (
                  <li key={item.name}>
                    <Link
                      href={item.href}
                      title={collapsed ? item.name : undefined}
                      className={cn(
                        'group relative flex items-center rounded-lg text-sm font-medium transition-all duration-150',
                        collapsed ? 'justify-center mx-2 px-0 py-2.5' : 'gap-3 mx-1 px-3 py-2.5',
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
                      {!collapsed && (
                        <>
                          <span className="flex-1 truncate">{item.name}</span>
                          {hasBadge && (
                            <span className={cn('ml-auto flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-semibold text-white', badgeColor)}>
                              {badgeCount}
                            </span>
                          )}
                          {isActive && !hasBadge && (
                            <ChevronRight className="h-3.5 w-3.5 text-indigo-400" />
                          )}
                        </>
                      )}
                      {/* Badge en mode réduit */}
                      {collapsed && hasBadge && (
                        <span className={cn('absolute top-1 right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full text-[8px] font-bold text-white', badgeColor)}>
                          {badgeCount}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}

        {/* Déconnexion — sous Configuration, dans le menu défilant */}
        <div
          className={cn(
            'border-t border-slate-100 mt-2 pt-3',
            collapsed ? 'mx-2' : 'mx-1'
          )}
        >
          <button
            type="button"
            onClick={handleLogout}
            title={collapsed ? 'Se déconnecter' : undefined}
            className={cn(
              'w-full flex items-center rounded-lg text-sm font-medium text-slate-500 hover:bg-red-50 hover:text-red-600 transition-colors group',
              collapsed ? 'justify-center px-0 py-2.5' : 'gap-2.5 px-3 py-2'
            )}
          >
            <LogOut className="w-4 h-4 text-slate-400 group-hover:text-red-500 transition-colors shrink-0" />
            {!collapsed && 'Se déconnecter'}
          </button>
        </div>
      </nav>

      {/* Pied de page — version / crédits (masqué si sidebar réduite) */}
      {!collapsed && (
        <div className="border-t border-slate-100 px-4 py-4">
          <div className="rounded-lg bg-indigo-50 p-3">
            <p className="text-xs font-semibold text-indigo-700">Boulangerie Bretzel</p>
            <p className="text-xs text-indigo-500 mt-0.5">© 2026 - version 0.1</p>
          </div>
        </div>
      )}

      {/* Bouton toggle — coin bas droit de la sidebar */}
      <button
        onClick={onToggle}
        className="absolute -right-3 top-[72px] z-40 flex h-6 w-6 items-center justify-center rounded-full bg-white border border-slate-200 shadow-sm hover:bg-indigo-50 hover:border-indigo-300 transition-all"
        title={collapsed ? 'Agrandir le menu' : 'Réduire le menu'}
      >
        {collapsed
          ? <PanelLeftOpen className="w-3 h-3 text-slate-500" />
          : <PanelLeftClose className="w-3 h-3 text-slate-500" />
        }
      </button>
    </aside>
  );
}
