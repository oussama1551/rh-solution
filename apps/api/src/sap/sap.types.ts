export type SapEmployee = {
  empID: string;
  biotimeId: string | null;
  Nom: string | null;
  Prenom: string | null;
  Poste: string | null;
  Structure: string | null;
  Date_Entrer: Date | string | null;
  mobile: string | null;
};

export type SapCandidate = SapEmployee & {
  company: string;
  sapFullName: string;
  normalizedName: string;
  normalizedPhone: string;
};

export type MatchResult = {
  sap: SapCandidate;
  nameMatches: boolean;
  phoneMatches: boolean;
  score: number;
};

export type SapPayrollLine = {
  company: string;
  sapMatricule: string;
  lastName: string | null;
  firstName: string | null;
  period: string;
  rubricCode: string;
  rubricLabel: string | null;
  base: number | string | null;
  amount: number | string | null;
};
