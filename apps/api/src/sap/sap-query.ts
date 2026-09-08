export const SAP_EMPLOYEES_QUERY = `
(SELECT 'FABCOM_DEV-' || T0."empID" as "empID", TO_NVARCHAR(T0."U_CMC_ID") as "biotimeId", T0."lastName" as "Nom", T0."firstName" as "Prenom", T1."Name" as "Poste", T2."Name" as "Structure", T0."startDate" as "Date_Entrer", T0."mobile", TO_NVARCHAR(T0."U_CMC_NACP3") as "bankAccount"
    FROM "FABCOM_DEV".OHEM T0
    LEFT JOIN "FABCOM_DEV"."@CMC_EMPL" T1 ON T0."U_CMC_EMP" = T1."Code"
    LEFT JOIN "FABCOM_DEV"."@CMC_UGO" T2 ON T0."U_CMC_UGO" = T2."Code"
    WHERE T0."Active" ='Y')
UNION
(SELECT 'RECYCLAGE_DEV-' || T0."empID" as "empID", TO_NVARCHAR(T0."U_CMC_ID") as "biotimeId", T0."lastName" as "Nom", T0."firstName" as "Prenom", T1."Name" as "Poste", T2."Name" as "Structure", T0."startDate" as "Date_Entrer", T0."mobile", TO_NVARCHAR(T0."U_CMC_NACP3") as "bankAccount"
    FROM "RECYCLAGE_DEV".OHEM T0
    LEFT JOIN "RECYCLAGE_DEV"."@CMC_EMPL" T1 ON T0."U_CMC_EMP" = T1."Code"
    LEFT JOIN "RECYCLAGE_DEV"."@CMC_UGO" T2 ON T0."U_CMC_UGO" = T2."Code"
    WHERE T0."Active" ='Y')
UNION
(SELECT 'NEWTECH_DEV-' || T0."empID" as "empID", TO_NVARCHAR(T0."U_CMC_ID") as "biotimeId", T0."lastName" as "Nom", T0."firstName" as "Prenom", T1."Name" as "Poste", T2."Name" as "Structure", T0."startDate" as "Date_Entrer", T0."mobile", TO_NVARCHAR(T0."U_CMC_NACP3") as "bankAccount"
    FROM "NEWTECH_DEV".OHEM T0
    LEFT JOIN "NEWTECH_DEV"."@CMC_EMPL" T1 ON T0."U_CMC_EMP" = T1."Code"
    LEFT JOIN "NEWTECH_DEV"."@CMC_UGO" T2 ON T0."U_CMC_UGO" = T2."Code"
    WHERE T0."Active" ='Y')
`;

export function sapPayrollLinesQuery(period: string) {
  const safePeriod = period.replace(/'/g, "''");
  return [
    payrollSchemaQuery("FABCOM_DEV", "FABCOM", safePeriod),
    payrollSchemaQuery("RECYCLAGE_DEV", "RECYCLAGE", safePeriod),
    payrollSchemaQuery("NEWTECH_DEV", "NEWTECH", safePeriod)
  ].join("\nUNION\n");
}

function payrollSchemaQuery(schema: string, company: string, period: string) {
  return `(SELECT '${company}' AS "company",
    TO_NVARCHAR(T0."U_CMC_PO_Matr") AS "sapMatricule",
    T2."lastName" AS "lastName",
    T2."firstName" AS "firstName",
    T0."U_CMC_PO_Peri" AS "period",
    T1."U_CMC_PO_CRub" AS "rubricCode",
    T1."U_CMC_PO_Rubr" AS "rubricLabel",
    T1."U_CMC_PO_Base" AS "base",
    T1."U_CMC_PO_Mont" AS "amount"
  FROM "${schema}"."@CMC_PO_OBUL" T0
  INNER JOIN "${schema}"."@CMC_PO_BUL1" T1 ON T1."Code" = T0."Code"
  LEFT JOIN "${schema}".OHEM T2 ON T2."empID" = T0."U_CMC_PO_Matr"
  WHERE T0."Canceled" = 'N'
    AND T0."U_CMC_PO_Peri" = '${period}')`;
}

export function sapOperationalAbsencesQuery(period: string) {
  const { month, year } = parsePeriod(period);
  return [operationalAbsenceSchema("FABCOM_DEV", "FABCOM", month, year), operationalAbsenceSchema("RECYCLAGE_DEV", "RECYCLAGE", month, year), operationalAbsenceSchema("NEWTECH_DEV", "NEWTECH", month, year)].join("\nUNION ALL\n");
}

export function sapOperationalOvertimeQuery(period: string) {
  const { month, year } = parsePeriod(period);
  return [operationalOvertimeSchema("FABCOM_DEV", "FABCOM", month, year), operationalOvertimeSchema("RECYCLAGE_DEV", "RECYCLAGE", month, year), operationalOvertimeSchema("NEWTECH_DEV", "NEWTECH", month, year)].join("\nUNION ALL\n");
}

function operationalAbsenceSchema(schema: string, company: string, month: number, year: number) {
  return `(SELECT TO_NVARCHAR(T0."empID") AS "sapMatricule", T0."lastName" AS "lastName", T0."firstName" AS "firstName", '${company}' AS "company",
    TO_NVARCHAR(MONTH(T1."fromDate")) || '/' || TO_NVARCHAR(YEAR(T1."fromDate")) AS "period",
    T1."U_CMC_PO_MABS" AS "absenceType", T1."U_CMC_PO_NBH" AS "hours", T1."U_CMC_PO_NBJ" AS "days"
    FROM "${schema}".OHEM T0 INNER JOIN "${schema}".HEM1 T1 ON T0."empID" = T1."empID"
    WHERE MONTH(T1."fromDate") = ${month} AND YEAR(T1."fromDate") = ${year})`;
}

function operationalOvertimeSchema(schema: string, company: string, month: number, year: number) {
  return `(SELECT TO_NVARCHAR(T0."empID") AS "sapMatricule", T0."lastName" AS "lastName", T0."firstName" AS "firstName", '${company}' AS "company",
    TO_NVARCHAR(MONTH(T2."U_CMC_PO_Date")) || '/' || TO_NVARCHAR(YEAR(T2."U_CMC_PO_Date")) AS "period",
    T2."U_CMC_PO_Date" AS "workDate", T2."U_CMC_PO_NbrH" AS "hours50", T2."U_CMC_PO_NbrH75" AS "hours75", T2."U_CMC_PO_NbrH100" AS "hours100"
    FROM "${schema}".OHEM T0
    INNER JOIN "${schema}"."@CMC_PO_HEUS" T1 ON T1."Code" = TO_NVARCHAR(T0."empID")
    INNER JOIN "${schema}"."@CMC_PO_HEU1" T2 ON T2."Code" = T1."Code"
    WHERE MONTH(T2."U_CMC_PO_Date") = ${month} AND YEAR(T2."U_CMC_PO_Date") = ${year})`;
}

function parsePeriod(period: string) {
  const match = /^(\d{1,2})\/(\d{4})$/.exec(period.trim());
  if (!match) throw new Error("Période invalide. Format attendu: M/YYYY.");
  const month = Number(match[1]), year = Number(match[2]);
  if (month < 1 || month > 12) throw new Error("Mois SAP invalide.");
  return { month, year };
}
