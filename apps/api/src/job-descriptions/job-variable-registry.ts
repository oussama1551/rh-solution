export type JobVariableDefinition = {
  code: string;
  label: string;
  group: "employee" | "job" | "company" | "document" | "manager";
  type: "text" | "date" | "image";
  sample: string;
  path: string[];
};

export const JOB_VARIABLES: JobVariableDefinition[] = [
  { code: "employee.matricule", label: "Matricule", group: "employee", type: "text", sample: "FABCOM_DEV-001", path: ["employee", "matricule"] },
  { code: "employee.full_name", label: "Nom et prénom", group: "employee", type: "text", sample: "NOM PRÉNOM", path: ["employee", "fullName"] },
  { code: "employee.hire_date", label: "Date d'embauche", group: "employee", type: "date", sample: "01/01/2024", path: ["employee", "hireDate"] },
  { code: "employee.department", label: "Département", group: "employee", type: "text", sample: "Production", path: ["employee", "department"] },
  { code: "employee.unit", label: "Unité", group: "employee", type: "text", sample: "FABCOM", path: ["employee", "organization", "unit"] },
  { code: "employee.sub_unit", label: "Sous-unité", group: "employee", type: "text", sample: "FAB Production", path: ["employee", "organization", "subUnit"] },
  { code: "employee.group", label: "Groupe", group: "employee", type: "text", sample: "Équipe A", path: ["employee", "organization", "group"] },
  { code: "job.source_sap_title", label: "Poste source SAP", group: "job", type: "text", sample: "Responsable IT", path: ["job", "sourceSapTitle"] },
  { code: "job.title", label: "Poste retenu", group: "job", type: "text", sample: "Responsable Infrastructure IT", path: ["job", "title"] },
  { code: "job.code", label: "Code poste", group: "job", type: "text", sample: "RESPIT", path: ["job", "code"] },
  { code: "company.name", label: "Société", group: "company", type: "text", sample: "FABCOM", path: ["company", "name"] },
  { code: "company.code", label: "Code société", group: "company", type: "text", sample: "FABCOM", path: ["company", "code"] },
  { code: "company.logo", label: "Logo société", group: "company", type: "image", sample: "LOGO", path: ["company", "logo"] },
  { code: "company.address", label: "Adresse société", group: "company", type: "text", sample: "Adresse de la société", path: ["company", "address"] },
  { code: "company.phone", label: "Téléphone société", group: "company", type: "text", sample: "+213 ...", path: ["company", "phone"] },
  { code: "document.reference", label: "Référence", group: "document", type: "text", sample: "FP-FAB-IT-RESPIT-001", path: ["document", "reference"] },
  { code: "document.version", label: "Version", group: "document", type: "text", sample: "V1.0", path: ["document", "version"] },
  { code: "document.effective_date", label: "Date d'effet", group: "document", type: "date", sample: "01/09/2026", path: ["document", "effectiveDate"] },
  { code: "manager.full_name", label: "Responsable hiérarchique", group: "manager", type: "text", sample: "RESPONSABLE HIÉRARCHIQUE", path: ["manager", "fullName"] },
  { code: "manager.job_title", label: "Fonction du responsable", group: "manager", type: "text", sample: "Directeur des opérations", path: ["manager", "jobTitle"] }
];

const VARIABLE_BY_CODE = new Map(JOB_VARIABLES.map(variable => [variable.code, variable]));
const TOKEN_PATTERN = /\{\{\s*([a-z][a-z0-9_.]*)\s*\}\}/gi;

export function resolveJobVariables<T>(value: T, context: Record<string, unknown>, useSamples = false) {
  const unknown = new Set<string>();
  const resolved = visit(value, text => text.replace(TOKEN_PATTERN, (token, rawCode: string) => {
    const code = rawCode.toLowerCase();
    const definition = VARIABLE_BY_CODE.get(code);
    if (!definition) { unknown.add(code); return token; }
    const contextValue = readPath(context, definition.path);
    if (contextValue === undefined || contextValue === null || contextValue === "") return useSamples ? definition.sample : "";
    return definition.type === "date" ? formatDate(contextValue) : String(contextValue);
  }));
  return { resolved, unknownVariables: [...unknown].sort() };
}

export function findJobVariables(value: unknown) {
  const found = new Set<string>();
  visit(value, text => { for (const match of text.matchAll(TOKEN_PATTERN)) found.add(match[1].toLowerCase()); return text; });
  return [...found].sort();
}

function visit<T>(value: T, transform: (text: string) => string): T {
  if (typeof value === "string") return transform(value) as T;
  if (Array.isArray(value)) return value.map(item => visit(item, transform)) as T;
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, visit(item, transform)])) as T;
  return value;
}
function readPath(context: Record<string, unknown>, path: string[]) { let current: any = context; for (const segment of path) { if (!current || typeof current !== "object") return undefined; current = current[segment]; } return current; }
function formatDate(value: unknown) { const date = value instanceof Date ? value : new Date(String(value)); return Number.isNaN(date.getTime()) ? String(value) : new Intl.DateTimeFormat("fr-FR").format(date); }
