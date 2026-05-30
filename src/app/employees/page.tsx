'use client';

import { useState, useMemo, useEffect } from 'react';
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  Mail,
  Phone,
  Filter,
  ChevronDown,
  Check,
  MoreHorizontal,
  UserCheck,
  UserX,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { EmployeeModal } from '@/components/employees/EmployeeModal';
import { usePlanningStore } from '@/lib/store';
import { Employee } from '@/lib/types';
import { getInitials, formatDate, DAY_NAMES_FR, CONTRACT_TYPES, CONTRACT_LABELS, getContractLabel, formatHours } from '@/lib/utils';
import { getPositionLabel, POSITION_RULES } from '@/lib/employeePosition';
import {
  format,
  startOfWeek,
  endOfWeek,
} from 'date-fns';

const POSITION_FILTERS = ['all', 'boulanger', 'vente', 'cuisine'] as const;
const CONTRACT_FILTERS = ['all', ...CONTRACT_TYPES] as const;

function getPositionFilterLabel(value: (typeof POSITION_FILTERS)[number]) {
  return value === 'all' ? 'Tous postes' : POSITION_RULES[value].label;
}

function getContractFilterLabel(value: (typeof CONTRACT_FILTERS)[number]) {
  if (value === 'all') return 'Tous contrats';
  return CONTRACT_LABELS[value];
}

export default function EmployeesPage() {
  const { employees, addEmployee, updateEmployee, deleteEmployee, getWeeklyHours, toggleMonthlyActive } =
    usePlanningStore();
  const [search, setSearch] = useState('');
  const [filterContract, setFilterContract] = useState<string>('all');
  const [filterPosition, setFilterPosition] = useState<string>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  // Évite l'erreur d'hydratation : les données du store ne sont disponibles
  // qu'après le montage côté client.
  useEffect(() => { setMounted(true); }, []);

  const today = new Date();
  const currentMonthKey = format(today, 'yyyy-MM');
  const weekStart = format(startOfWeek(today, { weekStartsOn: 1 }), 'yyyy-MM-dd');
  const weekEnd = format(endOfWeek(today, { weekStartsOn: 1 }), 'yyyy-MM-dd');

  const filteredEmployees = useMemo(() => {
    const q = search.toLowerCase();
    return employees.filter((e) => {
      const matchSearch =
        !q ||
        e.firstName.toLowerCase().includes(q) ||
        e.lastName.toLowerCase().includes(q) ||
        getPositionLabel(e.position).toLowerCase().includes(q) ||
        e.email.toLowerCase().includes(q);
      const matchContract = filterContract === 'all' || e.contractType === filterContract;
      const matchPosition =
        filterPosition === 'all' || e.position === filterPosition;
      return matchSearch && matchContract && matchPosition;
    });
  }, [employees, search, filterContract, filterPosition]);

  const handleSave = (data: Omit<Employee, 'id' | 'createdAt'>) => {
    if (editingEmployee) {
      updateEmployee(editingEmployee.id, data);
      toast.success(`${data.firstName} ${data.lastName} mis à jour`);
    } else {
      addEmployee(data);
      toast.success(`${data.firstName} ${data.lastName} ajouté(e)`);
    }
    setModalOpen(false);
    setEditingEmployee(null);
  };

  const handleEdit = (emp: Employee) => {
    setEditingEmployee(emp);
    setModalOpen(true);
  };

  const handleDelete = (id: string) => {
    const emp = employees.find((e) => e.id === id);
    deleteEmployee(id);
    setDeleteConfirm(null);
    toast.success(`${emp?.firstName} ${emp?.lastName} supprimé(e)`);
  };

  const handleToggleActive = (emp: Employee) => {
    const isInactiveThisMonth = (emp.inactiveMonths ?? []).includes(currentMonthKey);
    toggleMonthlyActive(emp.id, currentMonthKey);
    toast.success(
      `${emp.firstName} ${emp.lastName} ${isInactiveThisMonth ? 'réactivé(e) pour ce mois' : 'désactivé(e) pour ce mois'}`
    );
  };

  const activeCount = employees.filter((e) => e.isActive).length;
  const activeFilterCount =
    (filterPosition !== 'all' ? 1 : 0) + (filterContract !== 'all' ? 1 : 0);

  const resetFilters = () => {
    setFilterContract('all');
    setFilterPosition('all');
  };

  return (
    <div className="animate-fade-in">
      <Header
        title="Employés"
        subtitle={`${activeCount} employé${activeCount > 1 ? 's' : ''} actif${activeCount > 1 ? 's' : ''}`}
        actions={
          <Button
            onClick={() => {
              setEditingEmployee(null);
              setModalOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            Nouvel employé
          </Button>
        }
      />

      <div className="p-6 space-y-5">
        {/* Recherche + Filtres */}
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
          <div className="relative flex-1 max-w-md">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
              <Search className="size-4 text-slate-400" aria-hidden="true" />
            </div>
            <Input
              placeholder="Rechercher un employé..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="gap-2 shrink-0">
                <Filter className="size-4" />
                Filtres
                {activeFilterCount > 0 && (
                  <Badge variant="secondary" className="h-5 min-w-5 px-1.5 text-[10px]">
                    {activeFilterCount}
                  </Badge>
                )}
                <ChevronDown className="size-4 opacity-50" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuLabel>Poste</DropdownMenuLabel>
              {POSITION_FILTERS.map((value) => (
                <DropdownMenuItem
                  key={value}
                  onSelect={(e) => {
                    e.preventDefault();
                    setFilterPosition(value);
                  }}
                  className={filterPosition === value ? 'bg-slate-50 font-medium' : ''}
                >
                  <span className="flex-1">{getPositionFilterLabel(value)}</span>
                  {filterPosition === value && <Check className="size-4 text-emerald-600" />}
                </DropdownMenuItem>
              ))}

              <DropdownMenuSeparator />

              <DropdownMenuLabel>Contrat</DropdownMenuLabel>
              {CONTRACT_FILTERS.map((value) => (
                <DropdownMenuItem
                  key={value}
                  onSelect={(e) => {
                    e.preventDefault();
                    setFilterContract(value);
                  }}
                  className={filterContract === value ? 'bg-slate-50 font-medium' : ''}
                >
                  <span className="flex-1">{getContractFilterLabel(value)}</span>
                  {filterContract === value && <Check className="size-4 text-indigo-600" />}
                </DropdownMenuItem>
              ))}

              {activeFilterCount > 0 && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={(e) => {
                      e.preventDefault();
                      resetFilters();
                    }}
                    className="text-slate-500"
                  >
                    Réinitialiser les filtres
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Résultats */}
        {filteredEmployees.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center bg-white rounded-2xl border border-slate-100">
            <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
              <Search className="h-7 w-7 text-slate-400" />
            </div>
            <p className="text-base font-semibold text-slate-700">Aucun employé trouvé</p>
            <p className="text-sm text-slate-400 mt-1">Modifiez votre recherche ou ajoutez un employé</p>
            <Button
              className="mt-4"
              onClick={() => {
                setSearch('');
                resetFilters();
              }}
              variant="outline"
            >
              Réinitialiser les filtres
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredEmployees.map((emp) => {
              // On ne calcule les heures qu'après le montage pour éviter
              // toute divergence entre le rendu serveur et client.
              const weekHours = mounted ? getWeeklyHours(emp.id, weekStart, weekEnd) : 0;
              const overtimeRisk = mounted && weekHours > emp.contractHours;
              const isInactiveThisMonth = (emp.inactiveMonths ?? []).includes(currentMonthKey);

              return (
                <div
                  key={emp.id}
                  className={`bg-white rounded-2xl border shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden ${
                    isInactiveThisMonth ? 'border-slate-200 opacity-60' : 'border-slate-100'
                  }`}
                >
                  {/* Barre de couleur + header */}
                  <div
                    className="h-1.5 w-full"
                    style={{ backgroundColor: emp.color }}
                  />
                  <div className="p-5">
                    {/* Avatar + info principale */}
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-11 h-11 rounded-xl flex items-center justify-center text-sm font-bold text-white shadow-sm"
                          style={{ backgroundColor: emp.color }}
                        >
                          {getInitials(emp.firstName, emp.lastName)}
                        </div>
                        <div>
                          <h3 className="text-sm font-semibold text-slate-900">
                            {emp.firstName} {emp.lastName}
                          </h3>
                          <p className="text-xs text-slate-500">{getPositionLabel(emp.position)}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1">
                        {isInactiveThisMonth && (
                          <Badge variant="secondary" className="text-[10px]">Inactif ce mois</Badge>
                        )}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon-sm">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleEdit(emp)}>
                              <Pencil className="h-4 w-4 mr-2" /> Modifier
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleToggleActive(emp)}>
                              {isInactiveThisMonth ? (
                                <><UserCheck className="h-4 w-4 mr-2" /> Réactiver ce mois</>
                              ) : (
                                <><UserX className="h-4 w-4 mr-2" /> Désactiver ce mois</>
                              )}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-red-600 focus:text-red-700 focus:bg-red-50"
                              onClick={() => setDeleteConfirm(emp.id)}
                            >
                              <Trash2 className="h-4 w-4 mr-2" /> Supprimer
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>

                    {/* Infos de contact */}
                    <div className="space-y-1.5 mb-4">
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <Mail className="h-3.5 w-3.5 text-slate-400" />
                        <span className="truncate">{emp.email}</span>
                      </div>
                      {emp.phone && (
                        <div className="flex items-center gap-2 text-xs text-slate-500">
                          <Phone className="h-3.5 w-3.5 text-slate-400" />
                          <span>{emp.phone}</span>
                        </div>
                      )}
                    </div>

                    {/* Contrat + heures */}
                    <div className="flex items-center justify-between pt-3.5 border-t border-slate-100">
                      <div>
                        <p className="text-[10px] text-slate-400 uppercase tracking-wide">Contrat</p>
                        <p className="text-xs font-medium text-slate-700 mt-0.5">
                          {getContractLabel(emp.contractType)} · {emp.contractHours}h/sem
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] text-slate-400 uppercase tracking-wide">Cette semaine</p>
                        {mounted ? (
                          <p
                            className={`text-xs font-semibold mt-0.5 ${
                              overtimeRisk ? 'text-red-600' : 'text-emerald-700'
                            }`}
                          >
                            {formatHours(weekHours)}
                            {overtimeRisk && ' ⚠'}
                          </p>
                        ) : (
                          <p className="text-xs font-semibold mt-0.5 text-slate-300">—</p>
                        )}
                      </div>
                    </div>

                    {/* Disponibilités */}
                    <div className="mt-3 flex gap-1 flex-wrap">
                      {['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map((day) => {
                        const available = emp.availability.includes(day as any);
                        return (
                          <span
                            key={day}
                            className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                              available
                                ? 'bg-emerald-50 text-emerald-700'
                                : 'bg-slate-100 text-slate-400'
                            }`}
                          >
                            {DAY_NAMES_FR[day].substring(0, 3)}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal employé */}
      <EmployeeModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditingEmployee(null);
        }}
        onSave={handleSave}
        employee={editingEmployee}
        usedColors={employees
          .filter((e) => e.id !== editingEmployee?.id)
          .map((e) => e.color)}
      />

      {/* Dialog de confirmation suppression */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-xl p-6 w-full max-w-sm mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center">
                <Trash2 className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Supprimer l'employé</h3>
                <p className="text-xs text-slate-500">Cette action est irréversible</p>
              </div>
            </div>
            <p className="text-sm text-slate-600 mb-5">
              Êtes-vous sûr de vouloir supprimer{' '}
              <span className="font-semibold">
                {employees.find((e) => e.id === deleteConfirm)?.firstName}{' '}
                {employees.find((e) => e.id === deleteConfirm)?.lastName}
              </span>{' '}
              ? Toutes ses assignations de shifts seront également supprimées.
            </p>
            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setDeleteConfirm(null)}
              >
                Annuler
              </Button>
              <Button
                variant="destructive"
                className="flex-1"
                onClick={() => handleDelete(deleteConfirm)}
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
