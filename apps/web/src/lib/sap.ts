export function extractSapCompany(sapEmpId: string): string {
  const prefix = (sapEmpId || "").split("-")[0] || "";
  return prefix.replace(/_DEV$/i, "").toUpperCase() || "INCONNU";
}
