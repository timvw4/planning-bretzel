'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import {
  Building2,
  Clock,
  Bell,
  Shield,
  Save,
  Download,
  AlertTriangle,
  CalendarDays,
  Plus,
  X,
  RefreshCw,
  MapPin,
} from 'lucide-react';
import { format, getYear } from 'date-fns';
import toast from 'react-hot-toast';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { usePlanningStore } from '@/lib/store';
import { PublicHoliday } from '@/lib/types';
import {
  SWISS_DEFAULT_MAX_WEEKLY_HOURS,
  SWISS_LEGAL_MAX_WEEKLY_HOURS,
  SWISS_MIN_REST_HOURS,
} from '@/lib/swissLabor';

const WorkSiteMapPicker = dynamic(
  () => import('@/components/settings/WorkSiteMapPicker').then((mod) => mod.WorkSiteMapPicker),
  {
    ssr: false,
    loading: () => (
      <p className="text-xs text-slate-400 py-10 text-center rounded-xl border border-dashed border-slate-200">
        Chargement de la carte…
      </p>
    ),
  }
);

function SettingSection({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="flex items-start gap-4 px-6 py-5 border-b border-slate-100">
        <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
          <Icon className="w-4.5 h-4.5 text-indigo-600" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
          <p className="text-xs text-slate-500 mt-0.5">{description}</p>
        </div>
      </div>
      <div className="px-6 py-5 space-y-4">{children}</div>
    </div>
  );
}

function ToggleRow({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-1">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-slate-800">{label}</p>
        <p className="text-xs text-slate-400 mt-0.5">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        onClick={() => onChange(!value)}
        className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors ${
          value ? 'bg-indigo-600' : 'bg-slate-200'
        }`}
      >
        <span
          className={`absolute top-1 left-1 h-4 w-4 rounded-full bg-white shadow transition-transform ${
            value ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
}

// ---- Jours fériés français par année ----
function getFrenchHolidays(year: number): PublicHoliday[] {
  // Calcul de la date de Pâques (algorithme de Meeus/Jones/Butcher)
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const easterMonth = Math.floor((h + l - 7 * m + 114) / 31);
  const easterDay = ((h + l - 7 * m + 114) % 31) + 1;
  const easter = new Date(year, easterMonth - 1, easterDay);
  const easterMonday = new Date(easter); easterMonday.setDate(easter.getDate() + 1);
  const ascension  = new Date(easter); ascension.setDate(easter.getDate() + 39);
  const pentecost  = new Date(easter); pentecost.setDate(easter.getDate() + 50);

  const fmt = (d: Date) => format(d, 'yyyy-MM-dd');
  return [
    { date: `${year}-01-01`, name: 'Jour de l\'An' },
    { date: fmt(easterMonday),  name: 'Lundi de Pâques' },
    { date: `${year}-05-01`, name: 'Fête du Travail' },
    { date: `${year}-05-08`, name: 'Victoire 1945' },
    { date: fmt(ascension),     name: 'Ascension' },
    { date: fmt(pentecost),     name: 'Lundi de Pentecôte' },
    { date: `${year}-07-14`, name: 'Fête Nationale' },
    { date: `${year}-08-15`, name: 'Assomption' },
    { date: `${year}-11-01`, name: 'Toussaint' },
    { date: `${year}-11-11`, name: 'Armistice' },
    { date: `${year}-12-25`, name: 'Noël' },
  ].sort((a, b) => a.date.localeCompare(b.date));
}

export default function SettingsPage() {
  const { settings, updateSettings, employees, shifts, scheduleEntries } = usePlanningStore();

  const defaultNotifications = {
    overtime: true,
    unavailable: true,
    lowRest: true,
    geofencePunch: true,
  };
  const [notifications, setNotifications] = useState(
    settings.notifications ?? defaultNotifications
  );

  // ---- État local pour le formulaire d'ajout de jour férié ----
  const [newHolidayDate, setNewHolidayDate] = useState('');
  const [newHolidayName, setNewHolidayName] = useState('');

  const holidays = settings.holidays ?? [];

  const handleAddHoliday = async () => {
    if (!newHolidayDate || !newHolidayName.trim()) return;
    const already = holidays.some((h) => h.date === newHolidayDate);
    if (already) {
      toast.error('Ce jour est déjà dans la liste');
      return;
    }
    const updated = [...holidays, { date: newHolidayDate, name: newHolidayName.trim() }]
      .sort((a, b) => a.date.localeCompare(b.date));
    try {
      await updateSettings({ holidays: updated });
      setNewHolidayDate('');
      setNewHolidayName('');
      toast.success('Jour férié ajouté');
    } catch {
      /* erreur déjà affichée par le store */
    }
  };

  const handleRemoveHoliday = async (date: string) => {
    try {
      await updateSettings({ holidays: holidays.filter((h) => h.date !== date) });
    } catch {
      /* erreur déjà affichée par le store */
    }
  };

  const handlePrefillHolidays = async () => {
    const year = getYear(new Date());
    const prefilled = getFrenchHolidays(year);
    const existing = holidays.filter((h) => !prefilled.some((p) => p.date === h.date));
    const merged = [...existing, ...prefilled].sort((a, b) => a.date.localeCompare(b.date));
    try {
      await updateSettings({ holidays: merged });
      toast.success(`Jours fériés ${year} pré-remplis`);
    } catch {
      /* erreur déjà affichée par le store */
    }
  };

  const handleSave = async () => {
    try {
      await updateSettings({ notifications });
      toast.success('Paramètres de notifications enregistrés');
    } catch {
      /* erreur déjà affichée par le store */
    }
  };

  const handleExportData = () => {
    const data = {
      employees,
      shifts,
      scheduleEntries,
      settings,
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `planning-bretzel-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Données exportées');
  };

  const stats = {
    employees: employees.length,
    shifts: shifts.length,
    entries: scheduleEntries.length,
  };

  return (
    <div className="animate-fade-in">
      <Header
        title="Paramètres"
        subtitle="Configuration de l'application"
        actions={
          <Button onClick={handleSave}>
            <Save className="h-4 w-4" />
            Enregistrer
          </Button>
        }
      />

      <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Entreprise */}
        <SettingSection
          icon={Building2}
          title="Informations entreprise"
          description="Personnalisez les informations de votre établissement"
        >
          <div className="space-y-1.5">
            <Label>Nom de l'entreprise</Label>
            <Input
              value={settings.companyName}
              onChange={(e) => updateSettings({ companyName: e.target.value })}
              placeholder="Bretzel"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Langue</Label>
              <select
                value={settings.locale}
                onChange={(e) => updateSettings({ locale: e.target.value })}
                className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="fr-FR">Français</option>
                <option value="en-GB">English</option>
                <option value="de-DE">Deutsch</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Fuseau horaire</Label>
              <select
                value={settings.timezone}
                onChange={(e) => updateSettings({ timezone: e.target.value })}
                className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="Europe/Zurich">Europe/Zurich</option>
                <option value="Europe/Paris">Europe/Paris</option>
                <option value="Europe/London">Europe/London</option>
                <option value="Europe/Berlin">Europe/Berlin</option>
              </select>
            </div>
          </div>
        </SettingSection>

        {/* Périmètre travail — GPS déclarations d&apos;heures */}
        <SettingSection
          icon={MapPin}
          title="Périmètre travail (GPS)"
          description="Les employés sur « Mes heures » envoient leur position au moment de la déclaration. Si un périmètre est actif, il doit être dans le cercle."
        >
          <WorkSiteMapPicker
            value={settings.workSite ?? null}
            onChange={(workSite) => void updateSettings({ workSite })}
          />
        </SettingSection>

        {/* Planning */}
        <SettingSection
          icon={Clock}
          title="Règles de planning"
          description="Définissez les contraintes et limites de travail"
        >
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
            <Label className="min-h-10 leading-snug flex items-end">
              Repos minimum entre shifts (h)
            </Label>
            <Label className="min-h-10 leading-snug flex items-end">
              Max heures / semaine
            </Label>
            <Input
              type="number"
              min={8}
              max={24}
              value={settings.minRestHours}
              onChange={(e) =>
                updateSettings({ minRestHours: parseInt(e.target.value, 10) || SWISS_MIN_REST_HOURS })
              }
            />
            <Input
              type="number"
              min={20}
              max={SWISS_LEGAL_MAX_WEEKLY_HOURS}
              value={settings.maxWeeklyHours}
              onChange={(e) =>
                updateSettings({
                  maxWeeklyHours: parseInt(e.target.value, 10) || SWISS_DEFAULT_MAX_WEEKLY_HOURS,
                })
              }
            />
            <p className="text-[11px] text-slate-400">Légalement requis : {SWISS_MIN_REST_HOURS} h min (LTr)</p>
            <p className="text-[11px] text-slate-400">
              Max. légal Suisse : {SWISS_LEGAL_MAX_WEEKLY_HOURS} h (commerce / artisanat)
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>Premier jour de la semaine</Label>
            <div className="flex gap-2">
              {[
                { value: 1, label: 'Lundi' },
                { value: 0, label: 'Dimanche' },
              ].map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => updateSettings({ weekStartDay: opt.value as 0 | 1 })}
                  className={`px-4 py-2 rounded-lg text-sm font-medium border transition-all ${
                    settings.weekStartDay === opt.value
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Affichage du mois dans le planning</Label>
            <div className="flex flex-col gap-2">
              {[
                {
                  value: 'strict',
                  label: 'Mois strict',
                  description: 'Du 1er au dernier jour du mois exactement.',
                },
                {
                  value: 'full-weeks',
                  label: 'Semaines complètes',
                  description: 'Le mois commence le lundi de la semaine du 1er et se termine le dimanche de la dernière semaine.',
                },
              ].map((opt) => {
                const isSelected = (settings.planningMonthMode ?? 'strict') === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() => updateSettings({ planningMonthMode: opt.value as 'strict' | 'full-weeks' })}
                    className={`flex items-start gap-3 w-full text-left px-4 py-3 rounded-xl border transition-all ${
                      isSelected
                        ? 'bg-indigo-50 border-indigo-300 ring-1 ring-indigo-300'
                        : 'bg-white border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <span className={`mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
                      isSelected ? 'border-indigo-600' : 'border-slate-300'
                    }`}>
                      {isSelected && <span className="w-2 h-2 rounded-full bg-indigo-600" />}
                    </span>
                    <div>
                      <p className={`text-sm font-semibold ${isSelected ? 'text-indigo-700' : 'text-slate-700'}`}>
                        {opt.label}
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5 leading-snug">{opt.description}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </SettingSection>

        {/* Notifications */}
        <SettingSection
          icon={Bell}
          title="Notifications & Alertes"
          description="Choisissez quelles alertes vous souhaitez recevoir"
        >
          <div className="space-y-3 divide-y divide-slate-50">
            <ToggleRow
              label="Heures supplémentaires"
              description="Alerte si un employé dépasse son quota hebdomadaire"
              value={notifications.overtime}
              onChange={(v) => setNotifications((n) => ({ ...n, overtime: v }))}
            />
            <ToggleRow
              label="Indisponibilité"
              description="Alerte si un shift est attribué un jour d'indisponibilité"
              value={notifications.unavailable}
              onChange={(v) => setNotifications((n) => ({ ...n, unavailable: v }))}
            />
            <ToggleRow
              label="Repos insuffisant"
              description={`Alerte si moins de ${settings.minRestHours}h entre deux shifts`}
              value={notifications.lowRest}
              onChange={(v) => setNotifications((n) => ({ ...n, lowRest: v }))}
            />
            <ToggleRow
              label="Pointage hors périmètre GPS"
              description="Alerte quand un employé pointe son arrivée ou son départ hors zone"
              value={notifications.geofencePunch ?? true}
              onChange={(v) => setNotifications((n) => ({ ...n, geofencePunch: v }))}
            />
          </div>
        </SettingSection>

        {/* Jours fériés */}
        <SettingSection
          icon={CalendarDays}
          title="Jours fériés"
          description="Les jours fériés sont mis en évidence dans les plannings"
        >
          {/* Bouton pré-remplissage */}
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500">
              {holidays.length} jour{holidays.length !== 1 ? 's' : ''} configuré{holidays.length !== 1 ? 's' : ''}
            </p>
            <button
              onClick={handlePrefillHolidays}
              className="flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-700 transition-colors"
            >
              <RefreshCw className="w-3 h-3" />
              Pré-remplir {getYear(new Date())}
            </button>
          </div>

          {/* Liste des jours fériés */}
          {holidays.length > 0 && (
            <div className="rounded-xl border border-slate-100 divide-y divide-slate-50 overflow-hidden max-h-56 overflow-y-auto">
              {holidays.map((h) => (
                <div key={h.date} className="flex items-center justify-between px-3 py-2 hover:bg-slate-50 transition-colors">
                  <div className="flex items-center gap-3">
                    <span className="text-[11px] font-mono text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
                      {format(new Date(h.date + 'T00:00:00'), 'dd/MM/yyyy')}
                    </span>
                    <span className="text-xs text-slate-700">{h.name}</span>
                  </div>
                  <button
                    onClick={() => handleRemoveHoliday(h.date)}
                    className="w-5 h-5 rounded-full flex items-center justify-center text-slate-300 hover:text-red-400 hover:bg-red-50 transition-colors shrink-0"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Formulaire d'ajout */}
          <div className="flex gap-2 items-end pt-1">
            <div className="space-y-1">
              <Label className="text-[11px]">Date</Label>
              <Input
                type="date"
                value={newHolidayDate}
                onChange={(e) => setNewHolidayDate(e.target.value)}
                className="h-8 text-xs w-36"
              />
            </div>
            <div className="space-y-1 flex-1">
              <Label className="text-[11px]">Nom</Label>
              <Input
                value={newHolidayName}
                onChange={(e) => setNewHolidayName(e.target.value)}
                placeholder="ex: Noël"
                className="h-8 text-xs"
                onKeyDown={(e) => e.key === 'Enter' && handleAddHoliday()}
              />
            </div>
            <button
              onClick={handleAddHoliday}
              disabled={!newHolidayDate || !newHolidayName.trim()}
              className="h-8 w-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </SettingSection>

        {/* Données */}
        <SettingSection
          icon={Shield}
          title="Données & Sauvegarde"
          description="Exportez ou réinitialisez vos données"
        >
          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Employés', value: stats.employees },
              { label: 'Shifts', value: stats.shifts },
              { label: 'Entrées planning', value: stats.entries },
            ].map((stat) => (
              <div key={stat.label} className="bg-slate-50 rounded-xl p-3 text-center">
                <p className="text-lg font-bold text-slate-900">{stat.value}</p>
                <p className="text-[10px] text-slate-500 mt-0.5">{stat.label}</p>
              </div>
            ))}
          </div>

          <div className="space-y-2 pt-2">
            <Button
              variant="outline"
              className="w-full"
              onClick={handleExportData}
            >
              <Download className="h-4 w-4" />
              Exporter toutes les données (JSON)
            </Button>

            <div className="bg-red-50 rounded-xl border border-red-100 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                <div className="flex-1">
                  <p className="text-xs font-semibold text-red-700">Zone dangereuse</p>
                  <p className="text-xs text-red-500 mt-0.5">
                    La réinitialisation supprime définitivement toutes vos données.
                  </p>
                  <button
                    className="mt-2 text-xs font-medium text-red-600 hover:text-red-700 underline"
                    onClick={() => toast.error('Réinitialisation désactivée en mode démo')}
                  >
                    Réinitialiser toutes les données
                  </button>
                </div>
              </div>
            </div>
          </div>
        </SettingSection>
      </div>

      {/* Footer info */}
      <div className="mx-6 mb-6 p-4 bg-slate-50 rounded-2xl border border-slate-100">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-700">Planning Bretzel V0.1.2</p>
            <p className="text-xs text-slate-400 mt-0.5">
              Logiciel professionnel de gestion de planning — Léonard Bretzel
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-slate-400">Données stockées sur Supabase</p>
            <p className="text-[10px] text-slate-400">© 2026 Tous droits réservés</p>
          </div>
        </div>
      </div>
    </div>
  );
}
