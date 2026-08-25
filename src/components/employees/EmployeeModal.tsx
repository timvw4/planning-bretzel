'use client';

import { useState, useEffect } from 'react';
import { Employee, AvailabilityDay, ContractType, EmployeePosition } from '@/lib/types';
import {
  EMPLOYEE_POSITIONS,
  POSITION_RULES,
  countAnnualVacationDays,
} from '@/lib/employeePosition';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ToggleRow } from '@/components/ui/toggle-row';
import { EMPLOYEE_COLORS, DAY_NAMES_FR, CONTRACT_LABELS } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';
import {
  getDefaultContractHours,
  getMaxContractHours,
  getMinContractHours,
  clampContractHours,
  SWISS_DEFAULT_FULL_TIME_HOURS,
} from '@/lib/swissLabor';
import { cn } from '@/lib/utils';

interface EmployeeModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (data: Omit<Employee, 'id' | 'createdAt'>) => void;
  employee?: Employee | null;
  usedColors?: string[];
}

const AVAILABILITY_DAYS: AvailabilityDay[] = [
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
];

/** Quota proposé par défaut : 5 semaines, l'usage courant en boulangerie. */
const DEFAULT_VACATION_DAYS = 25;

const defaultForm: Omit<Employee, 'id' | 'createdAt'> = {
  firstName: '',
  lastName: '',
  position: 'vente',
  email: '',
  phone: '',
  color: EMPLOYEE_COLORS[0],
  availability: POSITION_RULES.vente.defaultAvailability,
  contractType: 'fixed',
  contractHours: POSITION_RULES.vente.defaultContractHours,
  annualVacationDays: DEFAULT_VACATION_DAYS,
  notes: '',
  isActive: true,
  inactiveMonths: [],
};

/** Repères légaux suisses (art. 329a CO), affichés à titre indicatif. */
const LEGAL_VACATION_DAYS_ADULT = 20;
const LEGAL_VACATION_DAYS_YOUNG = 25;

export function EmployeeModal({ open, onClose, onSave, employee, usedColors = [] }: EmployeeModalProps) {
  const [form, setForm] = useState(defaultForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  /**
   * L'absence de vacances est stockée comme « 0 jour autorisé » : pas de
   * réglage séparé en base, donc aucun risque de contradiction entre un
   * interrupteur allumé et un quota vide.
   */
  const [vacationEnabled, setVacationEnabled] = useState(true);
  /** Dernier quota saisi, pour le restituer si l'interrupteur est rallumé. */
  const [lastVacationDays, setLastVacationDays] = useState(DEFAULT_VACATION_DAYS);
  /** Jours de vacances déjà posés sur l'année civile en cours. */
  const [postedVacationDays, setPostedVacationDays] = useState<number | null>(null);

  useEffect(() => {
    if (employee) {
      const { id, createdAt, ...rest } = employee;
      const days = rest.annualVacationDays ?? DEFAULT_VACATION_DAYS;
      setForm({
        ...defaultForm,
        ...rest,
        annualVacationDays: days,
      });
      setVacationEnabled(days > 0);
      setLastVacationDays(days > 0 ? days : DEFAULT_VACATION_DAYS);
    } else {
      // Pour un nouvel employé, sélectionner automatiquement la première couleur non utilisée
      const firstAvailable = EMPLOYEE_COLORS.find((c) => !usedColors.includes(c)) ?? EMPLOYEE_COLORS[0];
      setForm({ ...defaultForm, color: firstAvailable });
      setVacationEnabled(true);
      setLastVacationDays(DEFAULT_VACATION_DAYS);
    }
    setPostedVacationDays(null);
    setErrors({});
  }, [employee, open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Vacances déjà posées cette année : sert à prévenir la direction avant
  // qu'elle ne coupe l'accès à un employé qui a déjà planifié ses congés.
  useEffect(() => {
    if (!open || !employee) return;
    let cancelled = false;

    async function loadPostedVacations(employeeId: string, workDays: AvailabilityDay[]) {
      const year = new Date().getFullYear();
      const { data, error } = await createClient()
        .from('availability_requests')
        .select('date, status')
        .eq('employee_id', employeeId)
        .eq('status', 'vacation')
        .gte('date', `${year}-01-01`)
        .lte('date', `${year}-12-31`);

      if (cancelled) return;
      if (error) {
        console.error('Vacances déjà posées :', error);
        return;
      }
      setPostedVacationDays(countAnnualVacationDays(data ?? [], workDays, year));
    }

    void loadPostedVacations(employee.id, employee.availability);
    return () => {
      cancelled = true;
    };
  }, [open, employee]);

  const handleVacationEnabledChange = (enabled: boolean) => {
    setVacationEnabled(enabled);
    if (enabled) {
      setForm((p) => ({ ...p, annualVacationDays: lastVacationDays }));
    } else {
      if (form.annualVacationDays > 0) setLastVacationDays(form.annualVacationDays);
      setForm((p) => ({ ...p, annualVacationDays: 0 }));
    }
    setErrors((p) => ({ ...p, annualVacationDays: '' }));
  };

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!form.firstName.trim()) newErrors.firstName = 'Le prénom est requis';
    if (!form.position) newErrors.position = 'Le poste est requis';
    // Email optionnel, mais validé si renseigné
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      newErrors.email = "L'email n'est pas valide";
    }
    const minH = getMinContractHours(form.contractType);
    const maxH = getMaxContractHours(form.contractType);
    if (form.contractHours < minH || form.contractHours > maxH) {
      newErrors.contractHours = `Entre ${minH} et ${maxH} h / semaine (Suisse)`;
    }
    if (form.contractType === 'fixed' && vacationEnabled) {
      if (form.annualVacationDays < 1 || form.annualVacationDays > 50) {
        newErrors.annualVacationDays =
          'Entre 1 et 50 jours par an, ou éteignez l’interrupteur ci-dessus';
      }
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validate()) {
      onSave(form);
    }
  };

  const toggleAvailability = (day: AvailabilityDay) => {
    setForm((prev) => ({
      ...prev,
      availability: prev.availability.includes(day)
        ? prev.availability.filter((d) => d !== day)
        : [...prev.availability, day],
    }));
  };

  const handlePositionChange = (position: EmployeePosition) => {
    const rules = POSITION_RULES[position];
    setForm((prev) => ({
      ...prev,
      position,
      availability: rules.defaultAvailability,
      contractHours:
        prev.contractType === 'fixed'
          ? rules.defaultContractHours
          : getDefaultContractHours(prev.contractType, position),
    }));
  };

  const handleContractTypeChange = (contractType: ContractType) => {
    setForm((prev) => ({
      ...prev,
      contractType,
      contractHours: getDefaultContractHours(contractType, prev.position),
    }));
  };

  const maxContractHours = getMaxContractHours(form.contractType);
  const minContractHours = getMinContractHours(form.contractType);

  const positionRules = POSITION_RULES[form.position];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {employee ? 'Modifier l\'employé' : 'Nouvel employé'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5 mt-2">
          {/* Prénom + Nom */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="firstName">
                Prénom <span className="text-red-400">*</span>
              </Label>
              <Input
                id="firstName"
                placeholder="Sophie"
                value={form.firstName}
                onChange={(e) => setForm((p) => ({ ...p, firstName: e.target.value }))}
                className={errors.firstName ? 'border-red-300 focus-visible:ring-red-500' : ''}
              />
              {errors.firstName && <p className="text-xs text-red-500">{errors.firstName}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lastName">
                Nom <span className="text-slate-400 text-xs font-normal">(optionnel)</span>
              </Label>
              <Input
                id="lastName"
                placeholder="Martin"
                value={form.lastName}
                onChange={(e) => setForm((p) => ({ ...p, lastName: e.target.value }))}
              />
            </div>
          </div>

          {/* Poste */}
          <div className="space-y-1.5">
            <Label>
              Poste <span className="text-red-400">*</span>
            </Label>
            <Select
              value={form.position}
              onValueChange={(v) => handlePositionChange(v as EmployeePosition)}
            >
              <SelectTrigger className={errors.position ? 'border-red-300' : ''}>
                <SelectValue placeholder="Choisir un poste" />
              </SelectTrigger>
              <SelectContent>
                {EMPLOYEE_POSITIONS.map((key) => (
                  <SelectItem key={key} value={key}>
                    {POSITION_RULES[key].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.position && <p className="text-xs text-red-500">{errors.position}</p>}
            <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2.5 text-xs text-slate-600 space-y-1">
              <p>{positionRules.description}</p>
              <p>
                <span className="font-medium text-slate-700">Horaire type :</span>{' '}
                {positionRules.typicalHours}
              </p>
              <p className="text-slate-500">
                {positionRules.canWorkNight ? 'Peut travailler de nuit · ' : ''}
                {positionRules.canWorkSunday
                  ? 'Peut travailler le dimanche'
                  : 'Pas de travail le dimanche'}
              </p>
            </div>
          </div>

          {/* Email + Téléphone */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="email">
                Email <span className="text-red-400">*</span>
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="sophie@bretzel.fr"
                value={form.email}
                onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                className={errors.email ? 'border-red-300' : ''}
              />
              {errors.email && <p className="text-xs text-red-500">{errors.email}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone">
                Téléphone <span className="text-slate-400 text-xs font-normal">(optionnel)</span>
              </Label>
              <Input
                id="phone"
                placeholder="+33 6 12 34 56 78"
                value={form.phone}
                onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
              />
            </div>
          </div>

          {/* Contrat + Heures */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Type de contrat</Label>
              <Select
                value={form.contractType}
                onValueChange={(v) => handleContractTypeChange(v as ContractType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(CONTRACT_LABELS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="contractHours">Heures / semaine</Label>
              <Input
                id="contractHours"
                type="number"
                min={minContractHours}
                max={maxContractHours}
                value={form.contractHours}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    contractHours: clampContractHours(
                      parseInt(e.target.value, 10) || getDefaultContractHours(p.contractType, p.position),
                      p.contractType
                    ),
                  }))
                }
              />
              {errors.contractHours ? (
                <p className="text-xs text-red-500">{errors.contractHours}</p>
              ) : (
                <p className="text-[11px] text-slate-400">
                  Temps plein suisse : {SWISS_DEFAULT_FULL_TIME_HOURS} h — max. {maxContractHours} h
                </p>
              )}
            </div>
          </div>

          {form.contractType === 'fixed' && (
            <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3 space-y-3">
              <ToggleRow
                label="L'employé pose ses vacances dans l'application"
                description="Éteint : il ne peut signaler que ses indisponibilités. Ses vacances restent gérées en dehors de l'application."
                value={vacationEnabled}
                onChange={handleVacationEnabledChange}
              />

              {vacationEnabled ? (
                <div className="space-y-1.5">
                  <Label htmlFor="annualVacationDays">Jours de vacances / an</Label>
                  <Input
                    id="annualVacationDays"
                    type="number"
                    min={1}
                    max={50}
                    value={form.annualVacationDays}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        annualVacationDays: Math.min(
                          50,
                          Math.max(0, parseInt(e.target.value, 10) || 0)
                        ),
                      }))
                    }
                    className={errors.annualVacationDays ? 'border-red-300' : ''}
                  />
                  {errors.annualVacationDays ? (
                    <p className="text-xs text-red-500">{errors.annualVacationDays}</p>
                  ) : (
                    <p className="text-[11px] leading-relaxed text-slate-400">
                      Quota sur l&apos;année civile, décompté sur ses jours habituels
                      uniquement. En Suisse, la loi prévoit au moins{' '}
                      {LEGAL_VACATION_DAYS_ADULT} jours par an (4 semaines), et{' '}
                      {LEGAL_VACATION_DAYS_YOUNG} jours (5 semaines) jusqu&apos;à 20 ans
                      révolus ou pour un apprenti.
                    </p>
                  )}
                </div>
              ) : (
                postedVacationDays !== null &&
                postedVacationDays > 0 && (
                  <p className="text-[11px] leading-relaxed text-amber-700">
                    {postedVacationDays} jour{postedVacationDays > 1 ? 's' : ''} de vacances
                    {postedVacationDays > 1 ? ' sont' : ' est'} déjà posé
                    {postedVacationDays > 1 ? 's' : ''} pour {new Date().getFullYear()}.
                    Rien n&apos;est effacé : ces jours restent au planning, et l&apos;employé
                    peut encore les retirer lui-même.
                  </p>
                )
              )}
            </div>
          )}

          {/* Couleur */}
          <div className="space-y-2">
            <Label>Couleur dans le planning</Label>
            <div className="flex flex-wrap gap-2">
              {EMPLOYEE_COLORS.map((color) => {
                const isSelected = form.color === color;
                const isUsed = usedColors.includes(color) && !isSelected;
                return (
                  <button
                    key={color}
                    type="button"
                    title={isUsed ? 'Déjà utilisée par un autre employé' : undefined}
                    className={cn(
                      'w-7 h-7 rounded-full transition-all duration-150 relative',
                      isSelected
                        ? 'ring-2 ring-offset-2 ring-slate-900 scale-110'
                        : isUsed
                        ? 'opacity-35 cursor-not-allowed'
                        : 'hover:scale-105'
                    )}
                    style={{ backgroundColor: color }}
                    onClick={() => setForm((p) => ({ ...p, color }))}
                  />
                );
              })}
            </div>
            <p className="text-[11px] text-slate-400">
              Les couleurs grisées sont déjà utilisées par d'autres employés.
            </p>
          </div>

          {/* Disponibilité */}
          <div className="space-y-2">
            <Label>Jours habituels de travail</Label>
            <div className="flex flex-wrap gap-2">
              {AVAILABILITY_DAYS.map((day) => {
                const isSelected = form.availability.includes(day);
                const isSundayBlocked =
                  day === 'sunday' && !positionRules.canWorkSunday;
                return (
                  <button
                    key={day}
                    type="button"
                    disabled={isSundayBlocked}
                    title={
                      isSundayBlocked
                        ? 'Non applicable pour ce poste'
                        : undefined
                    }
                    onClick={() => !isSundayBlocked && toggleAvailability(day)}
                    className={cn(
                      'px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 border',
                      isSundayBlocked
                        ? 'bg-slate-100 text-slate-300 border-slate-100 cursor-not-allowed'
                        : isSelected
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                        : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                    )}
                  >
                    {DAY_NAMES_FR[day].substring(0, 3)}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-slate-400">
              Pré-rempli selon le poste — ajustez si besoin (ex. temps partiel).
            </p>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              placeholder="Informations complémentaires, préférences..."
              value={form.notes}
              onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
              rows={3}
            />
          </div>

          <DialogFooter className="gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Annuler
            </Button>
            <Button type="submit">
              {employee ? 'Enregistrer' : 'Créer l\'employé'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
