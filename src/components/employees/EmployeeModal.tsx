'use client';

import { useState, useEffect } from 'react';
import { Employee, AvailabilityDay, ContractType } from '@/lib/types';
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
import { EMPLOYEE_COLORS, DAY_NAMES_FR, CONTRACT_LABELS } from '@/lib/utils';
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

const defaultForm: Omit<Employee, 'id' | 'createdAt'> = {
  firstName: '',
  lastName: '',
  role: '',
  email: '',
  phone: '',
  color: EMPLOYEE_COLORS[0],
  availability: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
  contractType: 'full-time',
  contractHours: 35,
  notes: '',
  isActive: true,
  inactiveMonths: [],
};

export function EmployeeModal({ open, onClose, onSave, employee, usedColors = [] }: EmployeeModalProps) {
  const [form, setForm] = useState(defaultForm);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (employee) {
      const { id, createdAt, ...rest } = employee;
      setForm(rest);
    } else {
      // Pour un nouvel employé, sélectionner automatiquement la première couleur non utilisée
      const firstAvailable = EMPLOYEE_COLORS.find((c) => !usedColors.includes(c)) ?? EMPLOYEE_COLORS[0];
      setForm({ ...defaultForm, color: firstAvailable });
    }
    setErrors({});
  }, [employee, open]); // eslint-disable-line react-hooks/exhaustive-deps

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!form.firstName.trim()) newErrors.firstName = 'Le prénom est requis';
    // Email optionnel, mais validé si renseigné
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      newErrors.email = "L'email n'est pas valide";
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

          {/* Rôle */}
          <div className="space-y-1.5">
            <Label htmlFor="role">
              Poste / Rôle <span className="text-red-400">*</span>
            </Label>
            <Input
              id="role"
              placeholder="Chef de rang, Barman..."
              value={form.role}
              onChange={(e) => setForm((p) => ({ ...p, role: e.target.value }))}
            />
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
                onValueChange={(v) => setForm((p) => ({ ...p, contractType: v as ContractType }))}
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
                min={1}
                max={60}
                value={form.contractHours}
                onChange={(e) => setForm((p) => ({ ...p, contractHours: parseInt(e.target.value) || 35 }))}
              />
            </div>
          </div>

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
            <Label>Jours de disponibilité</Label>
            <div className="flex flex-wrap gap-2">
              {AVAILABILITY_DAYS.map((day) => {
                const isSelected = form.availability.includes(day);
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => toggleAvailability(day)}
                    className={cn(
                      'px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 border',
                      isSelected
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                        : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                    )}
                  >
                    {DAY_NAMES_FR[day].substring(0, 3)}
                  </button>
                );
              })}
            </div>
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
