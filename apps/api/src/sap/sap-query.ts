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
    TO_NVARCHAR(T2."empID") AS "sapMatricule",
    T2."lastName" AS "lastName",
    T2."firstName" AS "firstName",
    T0."U_CMC_PO_Peri" AS "period",
    T1."U_CMC_PO_CRub" AS "rubricCode",
    T1."U_CMC_PO_Rubr" AS "rubricLabel",
    T1."U_CMC_PO_Base" AS "base",
    T1."U_CMC_PO_Mont" AS "amount"
  FROM "${schema}"."@CMC_PO_OBUL" T0
  INNER JOIN "${schema}"."@CMC_PO_BUL1" T1 ON T1."Code" = T0."Code"
  INNER JOIN "${schema}".OHEM T2 ON T2."empID" = T0."U_CMC_PO_Matr"
  WHERE T0."Canceled" = 'N'
    AND T1."U_CMC_PO_Mont" <> 0
    AND T0."U_CMC_PO_Peri" = '${period}')`;
}
