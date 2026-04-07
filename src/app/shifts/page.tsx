'use client';

import { useState, useEffect } from 'react';
import {
  Plus,
  Clock,
  Pencil,
  Trash2,
  Sun,
  Moon,
  Sunset,
  Coffee,
  Heart,
  Umbrella,
  BookOpen,
  MoreHorizontal,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { usePlanningStore } from '@/lib/store';
import { Shift, ShiftType } from '@/lib/types';
import { calculateShiftDuration, formatHours } from '@/lib/utils';

const SHIFT_TYPE_LABELS: Record<ShiftType, { label: string; icon: React.ElementType; color: string }> = {
  work: { label: 'Travail', icon: Clock, color: 'text-indigo-600 bg-indigo-50' },
  off: { label: 'Repos', icon: Coffee, color: 'text-slate-600 bg-slate-100' },
  vacation: { label: 'Congé', icon: Umbrella, color: 'text-emerald-700 bg-emerald-50' },
  sick: { label: 'Arrêt', icon: Heart, color: 'text-red-600 bg-red-50' },
  holiday: { label: 'Férié', icon: Sun, color: 'text-amber-700 bg-amber-50' },
  training: { label: 'Formation', icon: BookOpen, color: 'text-purple-700 bg-purple-50' },
};

const PRESET_COLORS = [
  { bg: '#FEE2E2', text: '#B91C1C' },   // Rouge
  { bg: '#DCFCE7', text: '#166534' },   // Vert clair
  { bg: '#D1FAE5', text: '#065F46' },   // Vert foncé
  { bg: '#E0F2FE', text: '#0369A1' },   // Bleu clair
  { bg: '#DBEAFE', text: '#1D4ED8' },   // Bleu foncé
  { bg: '#EDE9FE', text: '#6D28D9' },   // Violet
  { bg: '#FCE7F3', text: '#BE185D' },   // Rose
  { bg: '#FED7AA', text: '#C2410C' },   // Orange
  { bg: '#FEF08A', text: '#854D0E' },   // Jaune
  { bg: '#F1F5F9', text: '#475569' },   // Gris
  { bg: '#1E293B', text: '#F8FAFC' },   // Noir (texte clair lisible sur fond sombre)
  { bg: '#FEF3C7', text: '#92400E' },   // Brun
  { bg: '#FDF6EC', text: '#A16207' },   // Beige
];

interface ShiftForm {
  name: string;
  shortName: string;
  type: ShiftType;
  startTime: string;
  endTime: string;
  color: string;
  textColor: string;
  description: string;
  isActive: boolean;
}

const defaultForm: ShiftForm = {
  name: '',
  shortName: '',
  type: 'work',
  startTime: '08:00',
  endTime: '16:00',
  color: '#DBEAFE',
  textColor: '#1D4ED8',
  description: '',
  isActive: true,
};

function ShiftModal({
  open,
  onClose,
  onSave,
  shift,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (data: Omit<Shift, 'id'>) => void;
  shift?: Shift | null;
}) {
  const [form, setForm] = useState<ShiftForm>(defaultForm);

  // Remettre le formulaire à jour chaque fois que le shift ou l'état d'ouverture change
  useEffect(() => {
    if (shift) {
      setForm({
        name: shift.name,
        shortName: shift.shortName,
        type: shift.type,
        startTime: shift.startTime,
        endTime: shift.endTime,
        color: shift.color,
        textColor: shift.textColor,
        description: shift.description || '',
        isActive: shift.isActive,
      });
    } else {
      setForm(defaultForm);
    }
  }, [shift, open]);

  const isOffType = ['off', 'vacation', 'sick', 'holiday'].includes(form.type);
  const duration = isOffType ? 0 : calculateShiftDuration(form.startTime, form.endTime);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.shortName.trim()) {
      toast.error('Le nom et l\'abréviation sont requis');
      return;
    }
    onSave({
      ...form,
      durationHours: duration,
    });
  };

  const handleColorSelect = (preset: { bg: string; text: string }) => {
    setForm((p) => ({ ...p, color: preset.bg, textColor: preset.text }));
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{shift ? 'Modifier le shift' : 'Nouveau shift'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 space-y-1.5">
              <Label>Nom *</Label>
              <Input
                placeholder="Matin, Soir..."
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Abrév. *</Label>
              <Input
                placeholder="MAT"
                maxLength={4}
                value={form.shortName}
                onChange={(e) =>
                  setForm((p) => ({ ...p, shortName: e.target.value.toUpperCase() }))
                }
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select
              value={form.type}
              onValueChange={(v) => setForm((p) => ({ ...p, type: v as ShiftType }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(SHIFT_TYPE_LABELS).map(([key, { label }]) => (
                  <SelectItem key={key} value={key}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {!isOffType && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Heure début</Label>
                <Input
                  type="time"
                  value={form.startTime}
                  onChange={(e) => setForm((p) => ({ ...p, startTime: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Heure fin</Label>
                <Input
                  type="time"
                  value={form.endTime}
                  onChange={(e) => setForm((p) => ({ ...p, endTime: e.target.value }))}
                />
              </div>
            </div>
          )}

          {!isOffType && (
            <div className="flex items-center gap-2 py-2 px-3 bg-slate-50 rounded-lg">
              <Clock className="h-4 w-4 text-slate-400" />
              <span className="text-sm text-slate-600">Durée calculée :</span>
              <span className="text-sm font-semibold text-slate-900">{formatHours(duration)}</span>
            </div>
          )}

          {/* Couleur */}
          <div className="space-y-2">
            <Label>Couleur d'affichage</Label>
            <div className="grid grid-cols-7 gap-2">
              {PRESET_COLORS.map((preset) => {
                const isSelected = form.color === preset.bg;
                return (
                  <button
                    key={preset.bg}
                    type="button"
                    onClick={() => handleColorSelect(preset)}
                    title={preset.bg}
                    className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-150 ${
                      isSelected
                        ? 'ring-2 ring-offset-2 ring-slate-800 scale-110 shadow-md'
                        : 'hover:scale-105 hover:shadow-sm'
                    }`}
                    style={{ backgroundColor: preset.bg }}
                  >
                    <span
                      className="text-[9px] font-bold"
                      style={{ color: preset.text }}
                    >
                      Aa
                    </span>
                  </button>
                );
              })}
            </div>
            {/* Aperçu */}
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs text-slate-500">Aperçu :</span>
              <span
                className="px-2.5 py-1 rounded-lg text-xs font-semibold"
                style={{ backgroundColor: form.color, color: form.textColor }}
              >
                {form.shortName || 'ABC'}
              </span>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea
              placeholder="Description optionnelle..."
              value={form.description}
              onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              rows={2}
            />
          </div>

          <DialogFooter className="gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Annuler</Button>
            <Button type="submit">{shift ? 'Enregistrer' : 'Créer le shift'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function ShiftsPage() {
  const { shifts, addShift, updateShift, deleteShift } = usePlanningStore();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingShift, setEditingShift] = useState<Shift | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const handleSave = (data: Omit<Shift, 'id'>) => {
    if (editingShift) {
      updateShift(editingShift.id, data);
      toast.success(`Shift "${data.name}" mis à jour`);
    } else {
      addShift(data);
      toast.success(`Shift "${data.name}" créé`);
    }
    setModalOpen(false);
    setEditingShift(null);
  };

  const groupedShifts = shifts.reduce<Record<ShiftType, Shift[]>>(
    (acc, shift) => {
      if (!acc[shift.type]) acc[shift.type] = [];
      acc[shift.type].push(shift);
      return acc;
    },
    {} as Record<ShiftType, Shift[]>
  );

  return (
    <div className="animate-fade-in">
      <Header
        title="Shifts"
        subtitle={`${shifts.filter((s) => s.isActive).length} shifts configurés`}
        actions={
          <Button onClick={() => { setEditingShift(null); setModalOpen(true); }}>
            <Plus className="h-4 w-4" />
            Nouveau shift
          </Button>
        }
      />

      <div className="p-6 space-y-8">
        {/* Message affiché quand aucun shift n'existe */}
        {shifts.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
              <Clock className="h-8 w-8 text-slate-400" />
            </div>
            <h3 className="text-base font-semibold text-slate-700 mb-1">Aucun shift créé</h3>
            <p className="text-sm text-slate-400 max-w-xs">
              Cliquez sur &laquo;&nbsp;Nouveau shift&nbsp;&raquo; pour créer votre premier type de shift.
            </p>
          </div>
        )}

        {(Object.keys(SHIFT_TYPE_LABELS) as ShiftType[])
          .filter((type) => groupedShifts[type]?.length > 0)
          .map((type) => {
            const { label, icon: Icon, color } = SHIFT_TYPE_LABELS[type];
            return (
              <div key={type}>
                {/* En-tête de groupe */}
                <div className="flex items-center gap-2.5 mb-4">
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${color}`}>
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                  <h2 className="text-sm font-semibold text-slate-800">{label}</h2>
                  <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                    {groupedShifts[type].length}
                  </span>
                </div>

                {/* Cards de shifts */}
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {groupedShifts[type].map((shift) => (
                    <div
                      key={shift.id}
                      className="bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all overflow-hidden"
                    >
                      {/* Barre couleur */}
                      <div className="h-1.5" style={{ backgroundColor: shift.color }} />
                      <div className="p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-3">
                            <span
                              className="px-2.5 py-1.5 rounded-lg text-sm font-bold"
                              style={{ backgroundColor: shift.color, color: shift.textColor }}
                            >
                              {shift.shortName}
                            </span>
                            <div>
                              <p className="text-sm font-semibold text-slate-900">{shift.name}</p>
                              {shift.type === 'work' && (
                                <p className="text-xs text-slate-500 mt-0.5">
                                  {shift.startTime} – {shift.endTime}
                                </p>
                              )}
                            </div>
                          </div>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon-sm">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() => { setEditingShift(shift); setModalOpen(true); }}
                              >
                                <Pencil className="h-4 w-4 mr-2" /> Modifier
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-red-600 focus:bg-red-50"
                                onClick={() => setDeleteConfirm(shift.id)}
                              >
                                <Trash2 className="h-4 w-4 mr-2" /> Supprimer
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>

                        {/* Durée + description */}
                        <div className="mt-3 flex items-center justify-between">
                          {shift.durationHours > 0 ? (
                            <div className="flex items-center gap-1.5 text-xs text-slate-500">
                              <Clock className="h-3.5 w-3.5" />
                              <span className="font-medium text-slate-700">
                                {formatHours(shift.durationHours)}
                              </span>
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400">Sans horaire</span>
                          )}
                          {!shift.isActive && (
                            <Badge variant="secondary" className="text-[10px]">Inactif</Badge>
                          )}
                        </div>

                        {shift.description && (
                          <p className="text-xs text-slate-400 mt-2 leading-relaxed truncate-2">
                            {shift.description}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
      </div>

      <ShiftModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditingShift(null); }}
        onSave={handleSave}
        shift={editingShift}
      />

      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-xl p-6 w-full max-w-sm mx-4">
            <h3 className="text-sm font-semibold text-slate-900 mb-2">Supprimer le shift</h3>
            <p className="text-sm text-slate-600 mb-5">
              Êtes-vous sûr de vouloir supprimer le shift{' '}
              <strong>{shifts.find((s) => s.id === deleteConfirm)?.name}</strong> ?
            </p>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setDeleteConfirm(null)}>
                Annuler
              </Button>
              <Button
                variant="destructive"
                className="flex-1"
                onClick={() => {
                  const shift = shifts.find((s) => s.id === deleteConfirm);
                  deleteShift(deleteConfirm);
                  toast.success(`Shift "${shift?.name}" supprimé`);
                  setDeleteConfirm(null);
                }}
              >
                Supprimer
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
