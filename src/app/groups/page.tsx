'use client';

import { useState } from 'react';
import { Header } from '@/components/layout/Header';
import { usePlanningStore } from '@/lib/store';
import { useShallow } from 'zustand/react/shallow';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Users, Plus, Pencil, Trash2, Check, Search } from 'lucide-react';
import { EmployeeGroup } from '@/lib/types';

// ── Composant carte d'un groupe ──────────────────────────────
function GroupCard({
  group,
  employeeNames,
  onEdit,
  onDelete,
  onManageMembers,
}: {
  group: EmployeeGroup;
  employeeNames: Map<string, string>;
  onEdit: (group: EmployeeGroup) => void;
  onDelete: (group: EmployeeGroup) => void;
  onManageMembers: (group: EmployeeGroup) => void;
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex flex-col gap-4">
      {/* En-tête */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
            <Users className="w-5 h-5 text-indigo-600" />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-slate-900 truncate">{group.name}</p>
            <p className="text-xs text-slate-400 mt-0.5">
              {group.memberIds.length === 0
                ? 'Aucun membre'
                : `${group.memberIds.length} membre${group.memberIds.length > 1 ? 's' : ''}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => onEdit(group)}
            className="h-8 w-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            title="Renommer"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => onDelete(group)}
            className="h-8 w-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
            title="Supprimer"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Liste membres (aperçu) */}
      {group.memberIds.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {group.memberIds.slice(0, 6).map((id) => (
            <span
              key={id}
              className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-xs font-medium"
            >
              {employeeNames.get(id) ?? '—'}
            </span>
          ))}
          {group.memberIds.length > 6 && (
            <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-400 text-xs">
              +{group.memberIds.length - 6}
            </span>
          )}
        </div>
      ) : (
        <p className="text-xs text-slate-400 italic">Aucun employé dans ce groupe</p>
      )}

      {/* Bouton gérer membres */}
      <Button variant="outline" size="sm" onClick={() => onManageMembers(group)} className="mt-auto">
        Gérer les membres
      </Button>
    </div>
  );
}

// ── Page principale ──────────────────────────────────────────
export default function GroupsPage() {
  const { employees, groups, addGroup, updateGroup, deleteGroup, setGroupMembers } =
    usePlanningStore(
      useShallow((s) => ({
        employees: s.employees,
        groups: s.groups,
        addGroup: s.addGroup,
        updateGroup: s.updateGroup,
        deleteGroup: s.deleteGroup,
        setGroupMembers: s.setGroupMembers,
      }))
    );

  // Dialogues
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState('');

  const [editOpen, setEditOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<EmployeeGroup | null>(null);
  const [editName, setEditName] = useState('');

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<EmployeeGroup | null>(null);

  const [membersOpen, setMembersOpen] = useState(false);
  const [membersTarget, setMembersTarget] = useState<EmployeeGroup | null>(null);
  const [memberSearch, setMemberSearch] = useState('');
  const [pendingMemberIds, setPendingMemberIds] = useState<string[]>([]);

  // Carte id → nom d'employé
  const employeeNames = new Map(
    employees.map((e) => [e.id, `${e.firstName}${e.lastName ? ' ' + e.lastName : ''}`])
  );

  // ── Création ────────────────────────────────────────────────
  const handleCreate = () => {
    const name = createName.trim();
    if (!name) return;
    addGroup(name);
    setCreateName('');
    setCreateOpen(false);
  };

  // ── Édition ────────────────────────────────────────────────
  const openEdit = (group: EmployeeGroup) => {
    setEditTarget(group);
    setEditName(group.name);
    setEditOpen(true);
  };
  const handleEdit = () => {
    const name = editName.trim();
    if (!name || !editTarget) return;
    updateGroup(editTarget.id, name);
    setEditOpen(false);
    setEditTarget(null);
  };

  // ── Suppression ─────────────────────────────────────────────
  const openDelete = (group: EmployeeGroup) => {
    setDeleteTarget(group);
    setDeleteOpen(true);
  };
  const handleDelete = () => {
    if (!deleteTarget) return;
    deleteGroup(deleteTarget.id);
    setDeleteOpen(false);
    setDeleteTarget(null);
  };

  // ── Membres ─────────────────────────────────────────────────
  const openMembers = (group: EmployeeGroup) => {
    setMembersTarget(group);
    setPendingMemberIds([...group.memberIds]);
    setMemberSearch('');
    setMembersOpen(true);
  };
  const toggleMember = (id: string) => {
    setPendingMemberIds((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]
    );
  };
  const handleSaveMembers = () => {
    if (!membersTarget) return;
    setGroupMembers(membersTarget.id, pendingMemberIds);
    setMembersOpen(false);
    setMembersTarget(null);
  };

  const filteredEmployees = employees.filter((e) => {
    const name = `${e.firstName} ${e.lastName} ${e.role}`.toLowerCase();
    return name.includes(memberSearch.toLowerCase());
  });

  return (
    <div className="animate-fade-in flex flex-col min-h-screen">
      <Header
        title="Groupes d'employés"
        subtitle={`${groups.length} groupe${groups.length > 1 ? 's' : ''}`}
        actions={
          <Button onClick={() => setCreateOpen(true)} size="sm" className="gap-1.5">
            <Plus className="h-4 w-4" />
            Nouveau groupe
          </Button>
        }
      />

      <div className="flex-1 p-6">
        {groups.length === 0 ? (
          /* État vide */
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-2xl bg-indigo-50 flex items-center justify-center mb-4">
              <Users className="w-8 h-8 text-indigo-400" />
            </div>
            <h2 className="text-base font-semibold text-slate-900 mb-1">Aucun groupe</h2>
            <p className="text-sm text-slate-500 max-w-xs leading-relaxed">
              Créez des groupes pour organiser vos employés (ex. Boulangers, Vendeurs, Cuisiniers).
            </p>
            <Button onClick={() => setCreateOpen(true)} className="mt-6 gap-1.5">
              <Plus className="h-4 w-4" />
              Créer un groupe
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {groups.map((group) => (
              <GroupCard
                key={group.id}
                group={group}
                employeeNames={employeeNames}
                onEdit={openEdit}
                onDelete={openDelete}
                onManageMembers={openMembers}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Dialog : créer un groupe ────────────────────────── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Nouveau groupe</DialogTitle>
            <DialogDescription>
              Donnez un nom à ce groupe d&apos;employés.
            </DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            placeholder="Ex. Boulangers"
            value={createName}
            onChange={(e) => setCreateName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          />
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Annuler
            </Button>
            <Button onClick={handleCreate} disabled={!createName.trim()}>
              Créer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog : renommer un groupe ─────────────────────── */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Renommer le groupe</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleEdit()}
          />
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              Annuler
            </Button>
            <Button onClick={handleEdit} disabled={!editName.trim()}>
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog : confirmer la suppression ───────────────── */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Supprimer ce groupe ?</DialogTitle>
            <DialogDescription>
              Le groupe <strong>{deleteTarget?.name}</strong> sera définitivement supprimé.
              Les employés ne seront pas supprimés.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              Annuler
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Supprimer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog : gérer les membres ──────────────────────── */}
      <Dialog open={membersOpen} onOpenChange={setMembersOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Membres — {membersTarget?.name}
            </DialogTitle>
            <DialogDescription>
              Cochez les employés à inclure dans ce groupe.
            </DialogDescription>
          </DialogHeader>

          {/* Recherche */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              className="pl-9"
              placeholder="Rechercher un employé…"
              value={memberSearch}
              onChange={(e) => setMemberSearch(e.target.value)}
            />
          </div>

          {/* Liste des employés avec checkbox */}
          <div className="max-h-72 overflow-y-auto -mx-1 px-1 space-y-1">
            {filteredEmployees.length === 0 && (
              <p className="text-sm text-slate-400 text-center py-6">Aucun employé trouvé</p>
            )}
            {filteredEmployees.map((emp) => {
              const isChecked = pendingMemberIds.includes(emp.id);
              return (
                <button
                  key={emp.id}
                  onClick={() => toggleMember(emp.id)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-50 transition-colors text-left"
                >
                  {/* Checkbox visuelle */}
                  <span
                    className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${
                      isChecked
                        ? 'bg-indigo-600 border-indigo-600'
                        : 'border-slate-300 bg-white'
                    }`}
                  >
                    {isChecked && <Check className="h-3 w-3 text-white" />}
                  </span>
                  {/* Avatar couleur */}
                  <span
                    className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                    style={{ backgroundColor: emp.color }}
                  >
                    {emp.firstName[0]}{emp.lastName?.[0] ?? ''}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">
                      {emp.firstName} {emp.lastName}
                    </p>
                    {emp.role && (
                      <p className="text-xs text-slate-400 truncate">{emp.role}</p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          <p className="text-xs text-slate-400 text-center">
            {pendingMemberIds.length} membre{pendingMemberIds.length > 1 ? 's' : ''} sélectionné{pendingMemberIds.length > 1 ? 's' : ''}
          </p>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setMembersOpen(false)}>
              Annuler
            </Button>
            <Button onClick={handleSaveMembers}>
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
