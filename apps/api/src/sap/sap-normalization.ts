import { SapCandidate, SapEmployee } from "./sap.types";

export function normalizeName(value: string | null | undefined) {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(" ");
}

export function normalizedNameTokens(value: string | null | undefined) {
  return normalizeName(value).split(" ").filter(Boolean);
}

export function nameSearchScore(search: string | null | undefined, candidate: string | null | undefined) {
  const searchTokens = normalizedNameTokens(search);
  const candidateTokens = normalizedNameTokens(candidate);

  if (!searchTokens.length || !candidateTokens.length) {
    return 0;
  }

  const exactMatches = searchTokens.filter(token => candidateTokens.includes(token)).length;
  if (exactMatches === searchTokens.length) {
    return 90 + exactMatches;
  }

  const prefixMatches = searchTokens.filter(token =>
    token.length >= 2 && candidateTokens.some(candidateToken => tokenLooksRelated(token, candidateToken))
  ).length;
  if (prefixMatches === searchTokens.length) {
    return 75 + prefixMatches;
  }

  const fuzzyMatches = searchTokens.filter(token =>
    candidateTokens.some(candidateToken => isCloseToken(token, candidateToken))
  ).length;
  if (fuzzyMatches === searchTokens.length) {
    return 60 + fuzzyMatches;
  }

  if (searchTokens.length >= 2 && exactMatches >= 1) {
    return 25 + exactMatches;
  }

  if (prefixMatches > 0) {
    return 18 + prefixMatches;
  }

  return 0;
}

export function normalizePhone(value: string | null | undefined) {
  const digits = (value || "").replace(/\D/g, "");

  if (!digits) {
    return "";
  }

  let normalized = digits;
  if (normalized.startsWith("00213")) normalized = normalized.slice(5);
  if (normalized.startsWith("213")) normalized = normalized.slice(3);
  if (normalized.startsWith("0")) normalized = normalized.slice(1);
  return normalized.slice(-9);
}

export function isPhoneSearch(value: string | null | undefined) {
  return normalizePhone(value).length >= 6;
}

export function sapFullName(employee: SapEmployee) {
  return [employee.Nom, employee.Prenom].filter(Boolean).join(" ").trim();
}

export function toSapCandidate(employee: SapEmployee): SapCandidate {
  const fullName = sapFullName(employee);

  return {
    ...employee,
    company: extractSapCompany(employee.empID),
    sapFullName: fullName,
    normalizedName: normalizeName(fullName),
    normalizedPhone: normalizePhone(employee.mobile)
  };
}

export function extractSapCompany(sapEmpId: string): string {
  const prefix = (sapEmpId || "").split("-")[0] || "";
  return prefix.replace(/_DEV$/i, "").toUpperCase() || "INCONNU";
}

export function nameMatches(left: string, right: string) {
  if (!left || !right) return false;
  if (left === right) return true;
  const leftTokens = new Set(left.split(" "));
  const rightTokens = new Set(right.split(" "));
  const intersection = [...leftTokens].filter(token => rightTokens.has(token)).length;
  return intersection >= Math.min(leftTokens.size, rightTokens.size) && intersection >= 2;
}

function isCloseToken(left: string, right: string) {
  if (left.length < 4 || right.length < 4) return false;
  const distance = levenshteinDistance(left, right);
  const limit = Math.max(left.length, right.length) <= 5 ? 1 : 2;
  return distance <= limit;
}

function tokenLooksRelated(searchToken: string, candidateToken: string) {
  if (candidateToken.startsWith(searchToken) || searchToken.startsWith(candidateToken)) {
    return true;
  }

  if (searchToken.length >= 3 && candidateToken.includes(searchToken)) {
    return true;
  }

  return isCloseToken(searchToken, candidateToken);
}

function levenshteinDistance(left: string, right: string) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);

  for (let leftIndex = 0; leftIndex < left.length; leftIndex += 1) {
    const current = [leftIndex + 1];

    for (let rightIndex = 0; rightIndex < right.length; rightIndex += 1) {
      const insert = current[rightIndex] + 1;
      const remove = previous[rightIndex + 1] + 1;
      const replace = previous[rightIndex] + (left[leftIndex] === right[rightIndex] ? 0 : 1);
      current.push(Math.min(insert, remove, replace));
    }

    previous.splice(0, previous.length, ...current);
  }

  return previous[right.length];
}

export function phoneMatches(left: string, right: string) {
  return Boolean(left && right && left === right);
}

export function similarityScore(nameMatch: boolean, phoneMatch: boolean) {
  if (nameMatch && phoneMatch) return 1;
  if (nameMatch) return 0.68;
  if (phoneMatch) return 0.62;
  return 0;
}
