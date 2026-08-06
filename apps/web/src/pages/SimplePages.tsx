import { DataTable } from "../components/DataTable";
import { PageHeader } from "../components/PageHeader";
import { StatusBadge } from "../components/StatusBadge";
import { PermissionGate } from "../lib/auth";
import { AbsenceTypeCode, Permission, Shift } from "../lib/types";
import { useApi } from "../lib/useApi";
import { Button } from "../components/Button";
import { useMemo, useState } from "react";
import { api } from "../lib/api";

type UserRow = {
  id: string;
  username: string;
  fullName: string;
  email?: string | null;
  isActive: boolean;
  roles: Array<{ name: string; code: string }>;
  orgAccess?: Array<{ subUnitId: string; subUnitName: string; unitId: string; unitName: string }>;
};

type RoleRow = {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  userCount: number;
  permissions: Permission[];
};

type PermissionRow = {
  id: string;
  code: Permission;
  module: string;
  action: string;
  description?: string | null;
};

type AdminModuleRow = {
  code: string;
  label: string;
  path: string;
  permission: Permission;
  group: string;
};

type AdministrationOverview = {
  users: UserRow[];
  roles: RoleRow[];
  permissions: PermissionRow[];
  modules: AdminModuleRow[];
  orgUnits: Array<{ id: string; name: string; code: string; subUnits: Array<{ id: string; name: string }> }>;
};

type UserDraft = {
  id?: string;
  username: string;
  fullName: string;
  email: string;
  password: string;
  isActive: boolean;
  roleCodes: string[];
};

const emptyUserDraft: UserDraft = {
  username: "",
  fullName: "",
  email: "",
  password: "",
  isActive: true,
  roleCodes: []
};

export function RealtimePage() {
  return (
    <>
      <PageHeader title="Temps réel" />
      <section className="panel">
        <div className="empty-state">Flux de pointages prêt pour l’intégration `/api/attendance/realtime`.</div>
      </section>
    </>
  );
}

export function ShiftsPage() {
  const shifts = useApi<Shift[]>("/api/shifts", []);

  return (
    <>
      <PageHeader title="Shifts" actions={<PermissionGate permission="shifts.manage"><Button variant="primary">Nouveau shift</Button></PermissionGate>} />
      <section className="panel">
        <DataTable
          rows={shifts.data}
          empty="Aucun shift trouvé."
          columns={[
            { key: "code", header: "Code", render: row => row.code, sortValue: row => row.code },
            { key: "name", header: "Nom", render: row => row.name, sortValue: row => row.name },
            { key: "hours", header: "Horaires", render: row => `${row.startTime} - ${row.endTime}` },
            { key: "night", header: "Nuit", render: row => row.spansMidnight ? <StatusBadge value="VALIDATED" label="Traverse minuit" /> : "-" },
            { key: "days", header: "Jours", render: row => row.applicableDays.join(", ") },
            { key: "tolerance", header: "Marge", render: row => `-${row.toleranceBeforeMinutes}/+${row.toleranceAfterMinutes} min` },
            { key: "assignments", header: "Affectations", render: row => row._count?.assignments ?? 0, sortValue: row => row._count?.assignments ?? 0 },
            { key: "status", header: "Statut", render: row => <StatusBadge value={row.isActive ? "ACTIVE" : "UNKNOWN"} label={row.isActive ? "Actif" : "Inactif"} /> }
          ]}
        />
      </section>
    </>
  );
}

export function UsersAdminPage() {
  const administration = useApi<AdministrationOverview>("/api/administration/overview", {
    users: [],
    roles: [],
    permissions: [],
    modules: [],
    orgUnits: []
  });
  const absenceTypes = useApi<AbsenceTypeCode[]>("/api/attendance/absence-types", []);
  const [tab, setTab] = useState<"users" | "roles" | "permissions" | "modules" | "orgAccess" | "absenceTypes">("users");
  const [userDraft, setUserDraft] = useState<UserDraft | null>(null);
  const [orgAccessUserId, setOrgAccessUserId] = useState<string | null>(null);
  const [orgAccessSubUnitIds, setOrgAccessSubUnitIds] = useState<string[]>([]);
  const [roleDraftCode, setRoleDraftCode] = useState<string | null>(null);
  const [rolePermissionCodes, setRolePermissionCodes] = useState<Permission[]>([]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const permissionByCode = useMemo(() => new Map(administration.data.permissions.map(permission => [permission.code, permission])), [administration.data.permissions]);
  const selectedRole = useMemo(() => administration.data.roles.find(role => role.code === roleDraftCode) || null, [administration.data.roles, roleDraftCode]);
  const selectedOrgAccessUser = useMemo(() => administration.data.users.find(user => user.id === orgAccessUserId) || null, [administration.data.users, orgAccessUserId]);

  function startCreateUser() {
    setTab("users");
    setFormError(null);
    setNotice(null);
    setUserDraft({ ...emptyUserDraft, roleCodes: administration.data.roles.some(role => role.code === "GRH") ? ["GRH"] : [] });
  }

  function startEditUser(user: UserRow) {
    setTab("users");
    setFormError(null);
    setNotice(null);
    setUserDraft({
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      email: user.email || "",
      password: "",
      isActive: user.isActive,
      roleCodes: user.roles.map(role => role.code)
    });
  }

  function startEditOrgAccess(user: UserRow) {
    setTab("orgAccess");
    setFormError(null);
    setNotice(null);
    setOrgAccessUserId(user.id);
    setOrgAccessSubUnitIds(user.orgAccess?.map(item => item.subUnitId) || []);
  }

  function toggleOrgAccess(subUnitId: string) {
    setOrgAccessSubUnitIds(current => current.includes(subUnitId) ? current.filter(item => item !== subUnitId) : [...current, subUnitId]);
  }

  async function saveOrgAccess() {
    if (!selectedOrgAccessUser) return;
    setSaving(true);
    setFormError(null);
    setNotice(null);
    try {
      await api(`/api/users/${selectedOrgAccessUser.id}/org-access`, {
        method: "PATCH",
        body: JSON.stringify({ subUnitIds: orgAccessSubUnitIds })
      });
      setNotice(`Accès organigramme enregistrés pour ${selectedOrgAccessUser.fullName}.`);
      administration.reload();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Erreur lors de l'enregistrement des accès.");
    } finally {
      setSaving(false);
    }
  }

  function toggleUserRole(code: string) {
    setUserDraft(current => {
      if (!current) return current;
      const roleCodes = current.roleCodes.includes(code) ? current.roleCodes.filter(item => item !== code) : [...current.roleCodes, code];
      return { ...current, roleCodes };
    });
  }

  async function saveUser() {
    if (!userDraft) return;
    setSaving(true);
    setFormError(null);
    setNotice(null);
    try {
      const body: Record<string, unknown> = {
        username: userDraft.username.trim(),
        fullName: userDraft.fullName.trim(),
        email: userDraft.email.trim() || undefined,
        roleCodes: userDraft.roleCodes,
        isActive: userDraft.isActive
      };
      if (userDraft.password.trim()) body.password = userDraft.password;
      if (!userDraft.id && !body.password) {
        throw new Error("Le mot de passe est obligatoire pour un nouvel utilisateur.");
      }

      await api(userDraft.id ? `/api/users/${userDraft.id}` : "/api/users", {
        method: userDraft.id ? "PATCH" : "POST",
        body: JSON.stringify(body)
      });
      setUserDraft(null);
      setNotice("Utilisateur enregistré.");
      administration.reload();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Erreur lors de l'enregistrement.");
    } finally {
      setSaving(false);
    }
  }

  async function deactivateUser(user: UserRow) {
    setSaving(true);
    setFormError(null);
    setNotice(null);
    try {
      await api(`/api/users/${user.id}`, { method: "DELETE" });
      setNotice("Utilisateur désactivé.");
      administration.reload();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Erreur lors de la désactivation.");
    } finally {
      setSaving(false);
    }
  }

  function startEditRolePermissions(role: RoleRow) {
    setTab("roles");
    setFormError(null);
    setNotice(null);
    setRoleDraftCode(role.code);
    setRolePermissionCodes(role.permissions);
  }

  function toggleRolePermission(code: Permission) {
    setRolePermissionCodes(current => current.includes(code) ? current.filter(item => item !== code) : [...current, code]);
  }

  async function saveRolePermissions() {
    if (!selectedRole) return;
    setSaving(true);
    setFormError(null);
    setNotice(null);
    try {
      await api(`/api/roles/${selectedRole.code}/permissions`, {
        method: "PATCH",
        body: JSON.stringify({ permissionCodes: rolePermissionCodes })
      });
      setNotice(`Permissions du rôle ${selectedRole.code} enregistrées.`);
      administration.reload();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Erreur lors de l'enregistrement des permissions.");
    } finally {
      setSaving(false);
    }
  }

  async function updateAbsenceType(row: AbsenceTypeCode, patch: Partial<Pick<AbsenceTypeCode, "label" | "active">>) {
    setSaving(true);
    setFormError(null);
    setNotice(null);
    try {
      await api(`/api/attendance/absence-types/${row.code}`, {
        method: "PATCH",
        body: JSON.stringify({ label: patch.label ?? row.label, active: patch.active ?? row.active })
      });
      setNotice(`Type d'absence ${row.code} enregistré.`);
      absenceTypes.reload();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Erreur lors de l'enregistrement du type d'absence.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader title="Administration" actions={<PermissionGate permission="users.manage"><Button variant="primary" onClick={startCreateUser}>Nouvel utilisateur</Button></PermissionGate>} />
      {administration.error && <div className="alert alert-error">{administration.error}</div>}
      {formError && <div className="alert alert-error">{formError}</div>}
      {notice && <div className="alert alert-success">{notice}</div>}
      <div className="admin-summary-grid">
        <div>
          <span>Utilisateurs</span>
          <strong>{administration.data.users.length}</strong>
        </div>
        <div>
          <span>Rôles</span>
          <strong>{administration.data.roles.length}</strong>
        </div>
        <div>
          <span>Permissions</span>
          <strong>{administration.data.permissions.length}</strong>
        </div>
        <div>
          <span>Modules visibles</span>
          <strong>{administration.data.modules.length}</strong>
        </div>
      </div>
      <section className="panel">
        <div className="tabs admin-tabs">
          <button className={tab === "users" ? "active" : ""} onClick={() => setTab("users")}>Utilisateurs</button>
          <button className={tab === "roles" ? "active" : ""} onClick={() => setTab("roles")}>Rôles</button>
          <button className={tab === "permissions" ? "active" : ""} onClick={() => setTab("permissions")}>Permissions</button>
          <button className={tab === "orgAccess" ? "active" : ""} onClick={() => setTab("orgAccess")}>Accès organigramme</button>
          <button className={tab === "absenceTypes" ? "active" : ""} onClick={() => setTab("absenceTypes")}>Types absence</button>
          <button className={tab === "modules" ? "active" : ""} onClick={() => setTab("modules")}>Modules</button>
        </div>

        {tab === "users" && (
          <>
            {userDraft && (
              <div className="admin-edit-panel">
                <div className="panel-header">
                  <div>
                    <h2>{userDraft.id ? "Modifier utilisateur" : "Nouvel utilisateur"}</h2>
                    <span className="muted">Affectez un ou plusieurs rôles à cet utilisateur.</span>
                  </div>
                  <Button variant="ghost" onClick={() => setUserDraft(null)}>Annuler</Button>
                </div>
                <div className="admin-form-grid">
                  <label className="filter-field">
                    Utilisateur
                    <input value={userDraft.username} onChange={event => setUserDraft({ ...userDraft, username: event.target.value })} />
                  </label>
                  <label className="filter-field">
                    Nom complet
                    <input value={userDraft.fullName} onChange={event => setUserDraft({ ...userDraft, fullName: event.target.value })} />
                  </label>
                  <label className="filter-field">
                    Email
                    <input value={userDraft.email} onChange={event => setUserDraft({ ...userDraft, email: event.target.value })} />
                  </label>
                  <label className="filter-field">
                    Mot de passe
                    <input type="password" value={userDraft.password} placeholder={userDraft.id ? "Laisser vide pour garder l'actuel" : ""} onChange={event => setUserDraft({ ...userDraft, password: event.target.value })} />
                  </label>
                </div>
                <label className="checkbox-inline">
                  <input type="checkbox" checked={userDraft.isActive} onChange={event => setUserDraft({ ...userDraft, isActive: event.target.checked })} />
                  Compte actif
                </label>
                <div className="permission-check-grid">
                  {administration.data.roles.map(role => (
                    <label key={role.code} className="checkbox-inline">
                      <input type="checkbox" checked={userDraft.roleCodes.includes(role.code)} onChange={() => toggleUserRole(role.code)} />
                      {role.name} <span className="muted">{role.code}</span>
                    </label>
                  ))}
                </div>
                <div className="row-actions">
                  <Button variant="primary" disabled={saving} onClick={saveUser}>Enregistrer</Button>
                  <Button variant="ghost" onClick={() => setUserDraft(null)}>Annuler</Button>
                </div>
              </div>
            )}
            <DataTable
              rows={administration.data.users}
              empty="Aucun utilisateur trouvé."
              columns={[
                { key: "username", header: "Utilisateur", render: row => row.username, sortValue: row => row.username },
                { key: "name", header: "Nom", render: row => row.fullName, sortValue: row => row.fullName },
                { key: "email", header: "Email", render: row => row.email || "-" },
                { key: "roles", header: "Rôles", render: row => row.roles?.map(item => item.name).join(", ") || "-" },
                { key: "orgAccess", header: "Sous-unités", render: row => row.orgAccess?.length ? `${row.orgAccess.length} autorisée(s)` : "-" },
                { key: "status", header: "Statut", render: row => <StatusBadge value={row.isActive ? "ACTIVE" : "RESIGNED"} label={row.isActive ? "Actif" : "Désactivé"} /> },
                { key: "actions", header: "Actions", render: row => (
                  <div className="row-actions">
                    <PermissionGate permission="users.manage"><Button variant="ghost" onClick={() => startEditUser(row)}>Modifier</Button></PermissionGate>
                    <PermissionGate permission="users.manage"><Button variant="ghost" onClick={() => startEditOrgAccess(row)}>Organigramme</Button></PermissionGate>
                    {row.isActive && <PermissionGate permission="users.manage"><Button variant="danger" disabled={saving} onClick={() => deactivateUser(row)}>Désactiver</Button></PermissionGate>}
                  </div>
                ) }
              ]}
            />
          </>
        )}

        {tab === "roles" && (
          <>
            {selectedRole && (
              <div className="admin-edit-panel">
                <div className="panel-header">
                  <div>
                    <h2>Permissions - {selectedRole.name}</h2>
                    <span className="muted">{selectedRole.code} peut recevoir n'importe quelle permission disponible.</span>
                  </div>
                  <Button variant="ghost" onClick={() => setRoleDraftCode(null)}>Fermer</Button>
                </div>
                <div className="permission-check-grid">
                  {administration.data.permissions.map(permission => (
                    <label key={permission.code} className="checkbox-inline">
                      <input type="checkbox" checked={rolePermissionCodes.includes(permission.code)} onChange={() => toggleRolePermission(permission.code)} />
                      <code>{permission.code}</code>
                      <span className="muted">{permission.description || `${permission.module}.${permission.action}`}</span>
                    </label>
                  ))}
                </div>
                <div className="row-actions">
                  <PermissionGate permission="roles.manage"><Button variant="primary" disabled={saving} onClick={saveRolePermissions}>Enregistrer les permissions</Button></PermissionGate>
                  <Button variant="ghost" onClick={() => setRoleDraftCode(null)}>Annuler</Button>
                </div>
              </div>
            )}
            <DataTable
              rows={administration.data.roles}
              empty="Aucun rôle trouvé."
              columns={[
                { key: "code", header: "Code", render: row => <strong>{row.code}</strong>, sortValue: row => row.code },
                { key: "name", header: "Nom", render: row => row.name, sortValue: row => row.name },
                { key: "description", header: "Description", render: row => row.description || "-" },
                { key: "users", header: "Utilisateurs", render: row => row.userCount, sortValue: row => row.userCount },
                { key: "permissions", header: "Permissions", render: row => `${row.permissions.length} permission(s)`, sortValue: row => row.permissions.length },
                { key: "actions", header: "Actions", render: row => <PermissionGate permission="roles.manage"><Button variant="ghost" onClick={() => startEditRolePermissions(row)}>Permissions</Button></PermissionGate> }
              ]}
            />
          </>
        )}

        {tab === "permissions" && (
          <DataTable
            rows={administration.data.permissions}
            empty="Aucune permission trouvée."
            columns={[
              { key: "module", header: "Module", render: row => row.module, sortValue: row => row.module },
              { key: "action", header: "Action", render: row => row.action, sortValue: row => row.action },
              { key: "code", header: "Code", render: row => <code>{row.code}</code>, sortValue: row => row.code },
              { key: "description", header: "Description", render: row => row.description || "-" }
            ]}
          />
        )}

        {tab === "orgAccess" && (
          <div className="admin-edit-panel">
            <div className="panel-header">
              <div>
                <h2>Accès organigramme</h2>
                <span className="muted">Choisissez les sous-unités visibles pour un Responsable département ou Superviseur.</span>
              </div>
              {selectedOrgAccessUser && <Button variant="ghost" onClick={() => setOrgAccessUserId(null)}>Fermer</Button>}
            </div>

            <div className="admin-form-grid">
              <label className="filter-field">
                Utilisateur
                <select value={orgAccessUserId || ""} onChange={event => {
                  const user = administration.data.users.find(item => item.id === event.target.value) || null;
                  setOrgAccessUserId(user?.id || null);
                  setOrgAccessSubUnitIds(user?.orgAccess?.map(item => item.subUnitId) || []);
                }}>
                  <option value="">Choisir un utilisateur...</option>
                  {administration.data.users.map(user => (
                    <option key={user.id} value={user.id}>{user.fullName} - {user.roles.map(role => role.name).join(", ")}</option>
                  ))}
                </select>
              </label>
            </div>

            {selectedOrgAccessUser && (
              <>
                <div className="permission-check-grid org-access-grid">
                  {administration.data.orgUnits.map(unit => (
                    <div key={unit.id} className="org-access-unit">
                      <strong>{unit.name}</strong>
                      {unit.subUnits.map(subUnit => (
                        <label key={subUnit.id} className="checkbox-inline">
                          <input type="checkbox" checked={orgAccessSubUnitIds.includes(subUnit.id)} onChange={() => toggleOrgAccess(subUnit.id)} />
                          {subUnit.name}
                        </label>
                      ))}
                    </div>
                  ))}
                </div>
                <div className="row-actions">
                  <PermissionGate permission="users.manage"><Button variant="primary" disabled={saving} onClick={saveOrgAccess}>Enregistrer les accès</Button></PermissionGate>
                  <Button variant="ghost" onClick={() => setOrgAccessSubUnitIds(selectedOrgAccessUser.orgAccess?.map(item => item.subUnitId) || [])}>Réinitialiser</Button>
                </div>
              </>
            )}
          </div>
        )}

        {tab === "modules" && (
          <DataTable
            rows={administration.data.modules}
            empty="Aucun module trouvé."
            columns={[
              { key: "label", header: "Module", render: row => row.label, sortValue: row => row.label },
              { key: "group", header: "Groupe", render: row => row.group, sortValue: row => row.group },
              { key: "path", header: "Route", render: row => <code>{row.path}</code>, sortValue: row => row.path },
              { key: "permission", header: "Permission visibilité", render: row => permissionByCode.get(row.permission)?.description || row.permission }
            ]}
          />
        )}

        {tab === "absenceTypes" && (
          <>
            {absenceTypes.error && <div className="alert alert-error">{absenceTypes.error}</div>}
            <DataTable
              rows={absenceTypes.data}
              empty="Aucun type d'absence trouvé."
              columns={[
                { key: "code", header: "Code SAP", render: row => <strong>{row.code}</strong>, sortValue: row => row.code },
                { key: "label", header: "Libellé", render: row => row.label, sortValue: row => row.label },
                { key: "active", header: "Statut", render: row => <StatusBadge value={row.active ? "ACTIVE" : "RESIGNED"} label={row.active ? "Actif" : "Inactif"} /> },
                { key: "actions", header: "Actions", render: row => (
                  <PermissionGate permission="users.manage">
                    <div className="row-actions">
                      <Button variant="ghost" disabled={saving} onClick={() => {
                        const label = window.prompt("Libellé du type d'absence", row.label);
                        if (label?.trim()) void updateAbsenceType(row, { label: label.trim() });
                      }}>Modifier</Button>
                      <Button variant="ghost" disabled={saving} onClick={() => updateAbsenceType(row, { active: !row.active })}>
                        {row.active ? "Désactiver" : "Activer"}
                      </Button>
                    </div>
                  </PermissionGate>
                ) }
              ]}
            />
          </>
        )}
      </section>
    </>
  );
}

export function NotFoundPage() {
  return (
    <section className="panel">
      <div className="empty-state">Page introuvable.</div>
    </section>
  );
}
