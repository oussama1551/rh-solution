import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Check, Edit3, Plus, Trash2, Upload } from "lucide-react";
import { BiometricBadges } from "../components/BiometricBadges";
import { Button } from "../components/Button";
import { PageHeader } from "../components/PageHeader";
import { api } from "../lib/api";
import { BioTimeDepartment, BioTimeDepartmentResponse, BioTimeEmployeeForm, BioTimeEmployeeLive, Employee } from "../lib/types";
import { useApi } from "../lib/useApi";

type Draft = Required<Record<keyof Omit<BioTimeEmployeeForm, "raw">, string>>;

const emptyDraft: Draft = {
  id: "",
  localId: "",
  empCode: "",
  firstName: "",
  lastName: "",
  fullName: "",
  department: "",
  departmentName: "",
  position: "",
  employmentType: "",
  hireDate: "",
  area: "",
  superior: "",
  workflowRole: "",
  localName: "",
  gender: "",
  birthday: "",
  contactTel: "",
  officeTel: "",
  mobile: "",
  national: "",
  city: "",
  address: "",
  postcode: "",
  email: "",
  photo: ""
};

export function EmployeeBioTimeFormPage() {
  const { id } = useParams();
  const editing = Boolean(id);
  const navigate = useNavigate();
  const live = useApi<BioTimeEmployeeLive | null>(editing && id ? `/api/employees/${id}/biotime` : null, null);
  const departments = useApi<BioTimeDepartmentResponse>("/api/employees/biotime/departments", { departments: [], tree: [] });
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [initialDraft, setInitialDraft] = useState<Draft>(emptyDraft);
  const [photoChanged, setPhotoChanged] = useState(false);
  const [tab, setTab] = useState<"profile" | "private">("profile");
  const [saving, setSaving] = useState(false);
  const [photoAttempt, setPhotoAttempt] = useState<"proxy" | "direct" | "failed">("proxy");
  const [pendingPhoto, setPendingPhoto] = useState<File | null>(null);
  const [contractEndDate, setContractEndDate] = useState("");
  const [contractType, setContractType] = useState("");
  const [contractReference, setContractReference] = useState("");
  const [contractNote, setContractNote] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedEmployee, setSavedEmployee] = useState<Employee | null>(null);
  const employee = savedEmployee || live.data?.local || null;
  const departmentOptions = useMemo(() => flatDepartmentOptions(departments.data.tree), [departments.data.tree]);
  const pendingPhotoUrl = useMemo(() => pendingPhoto ? URL.createObjectURL(pendingPhoto) : null, [pendingPhoto]);
  const photoUrl = pendingPhotoUrl || (photoAttempt === "proxy" ? employee?.photoProxyUrl : employee?.photoUrl);
  const hasChanges = editing ? Boolean(pendingPhoto) || photoChanged || !sameDraft(draft, initialDraft) : Boolean(draft.empCode.trim() && draft.department.trim() && (draft.firstName.trim() || draft.lastName.trim() || draft.fullName.trim()));

  useEffect(() => {
    if (live.data?.biotime) {
      const next = toDraft(live.data.biotime);
      setDraft(next);
      setInitialDraft(next);
      setPhotoChanged(false);
      setPendingPhoto(null);
    }
  }, [live.data?.biotime?.id]);

  useEffect(() => {
    setPhotoAttempt("proxy");
  }, [employee?.photoProxyUrl]);

  if (!editing) {
    return <BulkEmployeeCreate departments={departments} departmentOptions={departmentOptions} />;
  }

  function update(field: keyof Draft, value: string) {
    setDraft(current => ({ ...current, [field]: value }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      if (!draft.department.trim()) {
        throw new Error("Le département BioTime est obligatoire.");
      }
      if (!editing && !draft.empCode.trim()) {
        throw new Error("Le numéro d'employé est obligatoire.");
      }

      if (!editing && !draft.hireDate) {
        throw new Error("La date de début du contrat est obligatoire.");
      }
      if (!editing && contractEndDate && contractEndDate < draft.hireDate) {
        throw new Error("La fin du contrat doit être après sa date de début.");
      }

      const payload = toPayload(draft, editing);
      if (!editing) {
        if (contractEndDate) payload.contractEndDate = contractEndDate;
        if (contractType.trim()) payload.contractType = contractType.trim();
        if (contractReference.trim()) payload.contractReference = contractReference.trim();
        if (contractNote.trim()) payload.contractNote = contractNote.trim();
      }
      let result: Employee | null = null;
      if (!editing || !sameDraft(draft, initialDraft)) {
        result = await api<Employee>(editing ? `/api/employees/${id}/biotime` : "/api/employees", {
          method: editing ? "PATCH" : "POST",
          body: JSON.stringify(payload)
        });
        setSavedEmployee(result);
      }
      const targetId = editing ? id : result?.id;
      if (pendingPhoto && targetId) {
        const form = new FormData();
        form.append("photo", pendingPhoto);
        result = await api<Employee>(`/api/employees/${targetId}/photo`, { method: "POST", body: form });
        setSavedEmployee(result);
      }
      setMessage(editing ? "Employé mis à jour dans BioTime et RH Solution." : "Employé créé dans BioTime et RH Solution.");
      if (!editing) {
        navigate(`/employees/${result!.id}/edit`, { replace: true });
      } else {
        setInitialDraft(draft);
        setPhotoChanged(false);
        setPendingPhoto(null);
        live.reload();
      }
    } catch (err) {
      setError(readableError(err, "Enregistrement impossible."));
    } finally {
      setSaving(false);
    }
  }

  function choosePhoto(file: File | null) {
    if (!file) return;
    setMessage(null);
    setError(null);
    setPendingPhoto(file);
    setPhotoChanged(true);
  }

  function handlePhotoError() {
    if (photoAttempt === "proxy" && employee?.photoUrl) {
      setPhotoAttempt("direct");
      return;
    }
    setPhotoAttempt("failed");
  }

  return (
    <>
      <PageHeader
        title={editing ? `Modifier ${employee?.fullName || "employé"}` : "Ajouter un employé"}
        backTo={editing && id ? `/employees/${id}` : "/employees"}
        backLabel={editing ? "Retour fiche" : "Retour aux employés"}
        actions={editing && id ? <Link className="btn btn-ghost" to={`/employees/${id}`}>Voir fiche</Link> : undefined}
      />
      <section className="panel">
        {live.loading && <div className="empty-state">Chargement live depuis BioTime...</div>}
        {live.error && <div className="alert alert-error">{live.error}</div>}
        {departments.error && <div className="alert alert-error">{departments.error}</div>}
        {message && <div className="alert alert-success">{message}</div>}
        {error && <div className="alert alert-error">{error}</div>}

        {(!editing || live.data) && (
          <>
            {editing && (
              <div className="employee-profile-card">
                <div className="employee-photo">
                  {photoUrl && photoAttempt !== "failed" ? <img src={photoUrl} alt={employee?.fullName || "Photo employé"} onError={handlePhotoError} /> : <span>{initials(employee?.fullName)}</span>}
                </div>
                <div className="employee-profile-actions">
                  <BiometricBadges enrollment={employee?.biometricEnrollment} />
                  <small className="muted">Lecture seule: l'enrôlement biométrique se fait sur le terminal physique.</small>
                  <label className="btn btn-secondary">
                    <Upload size={15} /> {pendingPhoto ? "Photo sélectionnée" : "Remplacer photo"}
                    <input type="file" accept="image/*" hidden onChange={event => choosePhoto(event.target.files?.[0] || null)} />
                  </label>
                </div>
              </div>
            )}

            <div className="tabs admin-tabs">
              <button className={tab === "profile" ? "active" : ""} onClick={() => setTab("profile")}>Profil</button>
              <button className={tab === "private" ? "active" : ""} onClick={() => setTab("private")}>Information privée</button>
            </div>

            <form className="admin-edit-panel" onSubmit={submit}>
              {tab === "profile" && (
                <div className="admin-form-grid">
                  <label className="filter-field">
                    Numéro d'employé
                    <input value={draft.empCode} disabled={editing} onChange={event => update("empCode", event.target.value)} required={!editing} />
                  </label>
                  <label className="filter-field">
                    Prénom
                    <input value={draft.firstName} onChange={event => update("firstName", event.target.value)} />
                  </label>
                  <label className="filter-field">
                    Nom de famille
                    <input value={draft.lastName} onChange={event => update("lastName", event.target.value)} />
                  </label>
                  <label className="filter-field">
                    Département BioTime
                    <select value={draft.department} onChange={event => update("department", event.target.value)} required>
                      <option value="">Choisir...</option>
                      {departmentOptions.map(option => <option key={option.code} value={option.code}>{option.label}</option>)}
                    </select>
                  </label>
                  <Field label="Position" value={draft.position} onChange={value => update("position", value)} />
                  <Field label="Type d'emploi" value={draft.employmentType} onChange={value => update("employmentType", value)} />
                  <label className="filter-field">
                    {editing ? "Date d'embauche" : "Début du contrat / embauche"}
                    <DateTextInput value={draft.hireDate} onChange={value => update("hireDate", value)} />
                  </label>
                  <Field label="Zone" value={draft.area} onChange={value => update("area", value)} />
                  <Field label="Supérieur" value={draft.superior} onChange={value => update("superior", value)} />
                  <Field label="Rôle du flux de travail" value={draft.workflowRole} onChange={value => update("workflowRole", value)} />
                </div>
              )}

              {!editing && tab === "profile" && (
                <div className="payroll-period-explanation">
                  <strong>Contrat initial</strong>
                  <span>La date de début du contrat est la date d'embauche ci-dessus. Le contrat et l'employé seront créés ensemble.</span>
                  <div className="admin-form-grid">
                    <label className="filter-field">Fin du contrat (facultative)<DateTextInput value={contractEndDate} onChange={setContractEndDate} /></label>
                    <Field label="Type de contrat" value={contractType} onChange={setContractType} />
                    <Field label="Référence" value={contractReference} onChange={setContractReference} />
                    <Field label="Note" value={contractNote} onChange={setContractNote} />
                  </div>
                </div>
              )}

              {tab === "private" && (
                <div className="admin-form-grid">
                  <Field label="Nom local" value={draft.localName} onChange={value => update("localName", value)} />
                  <label className="filter-field">
                    Genre
                    <select value={draft.gender} onChange={event => update("gender", event.target.value)}>
                      <option value="">Non renseigné</option>
                      <option value="M">M</option>
                      <option value="F">F</option>
                    </select>
                  </label>
                  <label className="filter-field">
                    Anniversaire
                    <DateTextInput value={draft.birthday} onChange={value => update("birthday", value)} />
                  </label>
                  <Field label="Contact Tél" value={draft.contactTel} onChange={value => update("contactTel", value)} />
                  <Field label="Tel. Bureau" value={draft.officeTel} onChange={value => update("officeTel", value)} />
                  <Field label="Mobile" value={draft.mobile} onChange={value => update("mobile", value)} />
                  <Field label="National" value={draft.national} onChange={value => update("national", value)} />
                  <Field label="Ville" value={draft.city} onChange={value => update("city", value)} />
                  <Field label="Adresse" value={draft.address} onChange={value => update("address", value)} />
                  <Field label="Code postal" value={draft.postcode} onChange={value => update("postcode", value)} />
                  <Field label="Email" type="email" value={draft.email} onChange={value => update("email", value)} />
                </div>
              )}

              <div className="row-actions">
                <Button variant="primary" type="submit" disabled={saving || departments.loading || !hasChanges}>{saving ? "Enregistrement..." : "Enregistrer dans BioTime"}</Button>
                <Link className="btn btn-ghost" to={editing && id ? `/employees/${id}` : "/employees"}>Annuler</Link>
              </div>
            </form>
          </>
        )}
      </section>
    </>
  );
}

type PendingEmployee = { key: string; draft: Draft };
const pendingEmployeesStorageKey = "rh.employee-create.pending.v1";
const pendingEmployeeDraftStorageKey = "rh.employee-create.draft.v1";

function BulkEmployeeCreate({ departments, departmentOptions }: { departments: ReturnType<typeof useApi<BioTimeDepartmentResponse>>; departmentOptions: Array<{ code: string; label: string }> }) {
  const latestCode = useApi<{ lastCode: string | null; nextCode: string | null; employeeCount: number }>("/api/employees/biotime/latest-code", { lastCode: null, nextCode: null, employeeCount: 0 });
  const [draft, setDraft] = useState<Draft>(loadPendingEmployeeDraft);
  const [rows, setRows] = useState<PendingEmployee[]>(loadPendingEmployees);
  const [selected, setSelected] = useState<string[]>(() => loadPendingEmployees().map(row => row.key));
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const suggestedCode = useMemo(() => {
    const base = Number(latestCode.data.nextCode);
    if (!Number.isSafeInteger(base)) return latestCode.data.nextCode || "";
    const used = new Set(rows.map(row => row.draft.empCode.trim())); let candidate = base;
    while (used.has(String(candidate))) candidate += 1;
    return String(candidate);
  }, [latestCode.data.nextCode, rows]);
  useEffect(() => { localStorage.setItem(pendingEmployeesStorageKey, JSON.stringify(rows)); }, [rows]);
  useEffect(() => { localStorage.setItem(pendingEmployeeDraftStorageKey, JSON.stringify(draft)); }, [draft]);

  function update(field: keyof Draft, value: string) { setDraft(current => ({ ...current, [field]: value })); }
  function clearDraft() { setDraft({ ...emptyDraft, area: "ZONE FABCOM" }); setEditingKey(null); }
  function validateDraft() {
    if (!draft.empCode.trim()) return "Le numéro d'employé est obligatoire.";
    if (!draft.firstName.trim() && !draft.lastName.trim()) return "Le nom ou le prénom est obligatoire.";
    if (!draft.department.trim()) return "Le département BioTime est obligatoire.";
    if (!isValidDateKey(draft.hireDate)) return "Saisissez une date valide, par exemple 23082026 pour le 23/08/2026.";
    if (rows.some(row => row.key !== editingKey && row.draft.empCode.trim().toLowerCase() === draft.empCode.trim().toLowerCase())) return "Ce numéro est déjà dans la liste.";
    return null;
  }
  function stage(event: FormEvent) {
    event.preventDefault(); setError(null); setMessage(null);
    const validation = validateDraft(); if (validation) return setError(validation);
    if (editingKey) setRows(current => current.map(row => row.key === editingKey ? { ...row, draft: { ...draft, area: "ZONE FABCOM" } } : row));
    else { const key = `pending-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`; setRows(current => [...current, { key, draft: { ...draft, area: "ZONE FABCOM" } }]); setSelected(current => [...current, key]); }
    clearDraft();
  }
  function edit(row: PendingEmployee) { setDraft({ ...row.draft, area: "ZONE FABCOM" }); setEditingKey(row.key); window.scrollTo({ top: 0, behavior: "smooth" }); }
  function remove(key: string) { setRows(current => current.filter(row => row.key !== key)); setSelected(current => current.filter(id => id !== key)); if (editingKey === key) clearDraft(); }
  function toggle(key: string) { setSelected(current => current.includes(key) ? current.filter(id => id !== key) : [...current, key]); }
  async function create(target: "selected" | "all") {
    const targets = rows.filter(row => target === "all" || selected.includes(row.key));
    if (!targets.length) return setError("Sélectionnez au moins un employé.");
    setSaving(true); setError(null); setMessage(null); const created: string[] = []; const failures: string[] = [];
    for (const row of targets) {
      try { await api<Employee>("/api/employees", { method: "POST", body: JSON.stringify(toPayload(row.draft, false)) }); created.push(row.key); }
      catch (caught) { failures.push(`${row.draft.empCode}: ${readableError(caught, "échec")}`); }
    }
    setRows(current => current.filter(row => !created.includes(row.key))); setSelected(current => current.filter(key => !created.includes(key)));
    if (created.length) setMessage(`${created.length} employé(s) et contrat(s) créés avec succès.`);
    if (failures.length) setError(`Non créés — ${failures.join(" | ")}`);
    if (created.length) latestCode.reload();
    setSaving(false);
  }

  return <>
    <PageHeader title="Ajouter des employés" backTo="/employees" backLabel="Retour aux employés" />
    <section className="panel employee-bulk-create">
      {departments.error && <div className="alert alert-error">{departments.error}</div>}{message && <div className="alert alert-success">{message}</div>}{error && <div className="alert alert-error">{error}</div>}
      <div className="employee-create-card">
        <div><strong>{editingKey ? "Modifier l'employé préparé" : "Informations nécessaires"}</strong><span>Zone appliquée automatiquement : <b>ZONE FABCOM</b></span></div>
        <form className="admin-form-grid" onSubmit={stage}>
          <label className="filter-field employee-code-field">Numéro d'employé<input value={draft.empCode} onChange={event => update("empCode", event.target.value)} /><small>{latestCode.loading ? "Lecture BioTime..." : `Dernier numéro BioTime : ${latestCode.data.lastCode || "-"}`}</small>{suggestedCode && !draft.empCode && <button type="button" onClick={() => update("empCode", suggestedCode)}>Utiliser le prochain : {suggestedCode}</button>}</label>
          <label className="filter-field">Prénom<input value={draft.firstName} onChange={event => update("firstName", event.target.value)} /></label>
          <label className="filter-field">Nom<input value={draft.lastName} onChange={event => update("lastName", event.target.value)} /></label>
          <label className="filter-field">Département BioTime<select value={draft.department} onChange={event => update("department", event.target.value)}><option value="">Choisir...</option>{departmentOptions.map(option => <option key={option.code} value={option.code}>{option.label}</option>)}</select></label>
          <label className="filter-field">Date contrat / embauche<DateTextInput value={draft.hireDate} onChange={value => update("hireDate", value)} /></label>
          <div className="row-actions employee-stage-actions"><Button variant="primary" type="submit"><Plus size={15} />{editingKey ? "Mettre à jour" : "Ajouter à la liste"}</Button>{editingKey && <Button variant="secondary" type="button" onClick={clearDraft}>Annuler</Button>}</div>
        </form>
      </div>
      <div className="panel-header"><div><h2>Employés préparés</h2><span className="muted">Cliquez sur une ligne pour la modifier rapidement · {selected.length}/{rows.length} sélectionné(s)</span></div><div className="row-actions"><Button variant="secondary" onClick={() => create("selected")} disabled={saving || !selected.length}><Check size={15} /> Créer la sélection</Button><Button variant="primary" onClick={() => create("all")} disabled={saving || !rows.length}><Check size={15} /> {saving ? "Création..." : "Créer toute la liste"}</Button></div></div>
      <div className="table-wrap"><table className="data-table"><thead><tr><th><input type="checkbox" checked={Boolean(rows.length) && selected.length === rows.length} onChange={event => setSelected(event.target.checked ? rows.map(row => row.key) : [])} /></th><th>Matricule</th><th>Employé</th><th>Département</th><th>Contrat / embauche</th><th>Zone</th><th>Actions</th></tr></thead><tbody>{rows.map(row => <tr key={row.key} className={editingKey === row.key ? "selected-row" : ""} onDoubleClick={() => edit(row)}><td><input type="checkbox" checked={selected.includes(row.key)} onChange={() => toggle(row.key)} /></td><td><strong>{row.draft.empCode}</strong></td><td>{`${row.draft.lastName} ${row.draft.firstName}`.trim()}</td><td>{departmentOptions.find(option => option.code === row.draft.department)?.label || row.draft.department}</td><td>{formatDateFr(row.draft.hireDate)}</td><td><span className="badge badge-blue">ZONE FABCOM</span></td><td><div className="row-actions"><button className="icon-button" type="button" onClick={() => edit(row)} title="Modifier"><Edit3 size={15} /></button><button className="icon-button danger" type="button" onClick={() => remove(row.key)} title="Retirer"><Trash2 size={15} /></button></div></td></tr>)}{!rows.length && <tr><td colSpan={7} className="empty-state">Ajoutez un ou plusieurs employés avant de lancer la création.</td></tr>}</tbody></table></div>
    </section>
  </>;
}

function loadPendingEmployees(): PendingEmployee[] {
  try { const value = JSON.parse(localStorage.getItem(pendingEmployeesStorageKey) || "[]"); return Array.isArray(value) ? value : []; }
  catch { return []; }
}

function loadPendingEmployeeDraft(): Draft {
  try { return { ...emptyDraft, ...JSON.parse(localStorage.getItem(pendingEmployeeDraftStorageKey) || "{}"), area: "ZONE FABCOM" }; }
  catch { return { ...emptyDraft, area: "ZONE FABCOM" }; }
}

function DateTextInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <input
      value={formatDateFr(value)}
      onChange={event => onChange(parseDateFr(event.target.value))}
      placeholder="JJ/MM/AAAA ou 23082026"
      inputMode="numeric"
    />
  );
}

function Field({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return (
    <label className="filter-field">
      {label}
      <input type={type} value={value} onChange={event => onChange(event.target.value)} />
    </label>
  );
}

function toDraft(value: BioTimeEmployeeForm): Draft {
  return Object.fromEntries(Object.keys(emptyDraft).map(key => [key, String((value as Record<string, unknown>)[key] || "")])) as Draft;
}

function toPayload(draft: Draft, editing: boolean) {
  const payload: Record<string, string> = {};
  for (const [key, value] of Object.entries(draft)) {
    if (["id", "localId", "fullName", "departmentName", "photo"].includes(key)) continue;
    if (editing && key === "empCode") continue;
    if (value.trim()) payload[key] = value.trim();
  }
  return payload;
}

function sameDraft(left: Draft, right: Draft) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function formatDateFr(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || "");
  if (!match) return value || "";
  const [, year, month, day] = match;
  return `${day}/${month}/${year}`;
}

function parseDateFr(value: string) {
  const trimmed = value.trim();
  const compact = /^(\d{2})(\d{2})(\d{4})$/.exec(trimmed);
  if (compact) {
    const [, day, month, year] = compact;
    const iso = `${year}-${month}-${day}`;
    return isValidDateKey(iso) ? iso : value;
  }
  const fr = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(trimmed);
  if (fr) {
    const [, day, month, year] = fr;
    const iso = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
    return isValidDateKey(iso) ? iso : value;
  }
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  return iso ? trimmed : value;
}

function isValidDateKey(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [, year, month, day] = match.map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

function flatDepartmentOptions(nodes: BioTimeDepartment[], depth = 0): Array<{ code: string; label: string }> {
  return nodes.flatMap(node => [
    { code: node.code, label: `${"  ".repeat(depth)}${node.name} (${node.code})` },
    ...flatDepartmentOptions(node.children || [], depth + 1)
  ]);
}

function readableError(error: unknown, fallback: string) {
  if (!(error instanceof Error)) return fallback;
  try {
    const parsed = JSON.parse(error.message);
    return parsed.message || JSON.stringify(parsed);
  } catch {
    return error.message || fallback;
  }
}

function initials(name?: string | null) {
  const parts = (name || "").split(" ").filter(Boolean);
  return `${parts[0]?.[0] || ""}${parts[1]?.[0] || ""}`.toUpperCase() || "RH";
}
