import { extractSapCompany, isPhoneSearch, nameMatches, nameSearchScore, normalizeName, normalizePhone, phoneMatches } from "../src/sap/sap-normalization";

describe("SAP matching normalization", () => {
  it("ignore les accents et la casse dans les noms", () => {
    expect(normalizeName("BÉLAKHDAR Oussama")).toBe(normalizeName("belakhdar oussama"));
  });

  it("supporte l'ordre nom/prénom inversé", () => {
    const left = normalizeName("BELAKHDAR OUSSAMA");
    const right = normalizeName("Oussama Belakhdar");

    expect(nameMatches(left, right)).toBe(true);
  });

  it("normalise les téléphones avec ou sans indicatif pays", () => {
    expect(normalizePhone("+213 550 12 34 56")).toBe(normalizePhone("0550 12 34 56"));
    expect(phoneMatches(normalizePhone("00213 550 12 34 56"), normalizePhone("550123456"))).toBe(true);
  });

  it("ignore les espaces multiples et ponctuations", () => {
    expect(normalizeName("  BELAKHDAR   -   OUSSAMA  ")).toBe(normalizeName("oussama belakhdar"));
  });

  it("extrait la société SAP depuis le préfixe empID", () => {
    expect(extractSapCompany("FABCOM_DEV-1234")).toBe("FABCOM");
    expect(extractSapCompany("RECYCLAGE_DEV-7788")).toBe("RECYCLAGE");
    expect(extractSapCompany("NEWTECH_DEV-9999")).toBe("NEWTECH");
  });

  it("ne traite pas une courte séquence numérique d'empID comme un téléphone", () => {
    expect(isPhoneSearch("FABCOM_DEV-213")).toBe(false);
    expect(isPhoneSearch("0550123456")).toBe(true);
  });

  it("retrouve un nom SAP même avec ordre différent ou mot supplémentaire", () => {
    expect(nameSearchScore("marmi toufik", "TOUFIK MARMI")).toBeGreaterThan(0);
    expect(nameSearchScore("marmi toufik", "MARMI TOUFIK PRODUCTION")).toBeGreaterThan(0);
  });

  it("retrouve un employé SAP avec un début de nom court", () => {
    expect(nameSearchScore("marm", "MARMI TOFIK")).toBeGreaterThan(0);
  });

  it("tolère une petite différence de translittération dans le prénom", () => {
    expect(nameSearchScore("marmi toufik", "MARMI TOUFEK")).toBeGreaterThan(0);
  });
});
