import { writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { CookieJar } from "tough-cookie";
import { BioTimeLicenseService } from "../src/sync/biotime-license.service";

describe("BioTimeLicenseService", () => {
  const filePath = join(process.cwd(), "test-license.xml");

  beforeEach(() => {
    writeFileSync(filePath, "<xmlInfo><license>test</license></xmlInfo>");
  });

  afterEach(() => {
    try {
      unlinkSync(filePath);
    } catch {
      // Le fichier temporaire peut déjà avoir été supprimé par un test.
    }
  });

  function config(values: Record<string, string>) {
    return {
      get: jest.fn((key: string) => values[key])
    };
  }

  it("réactive la licence hors ligne avant tout login web", async () => {
    const get = jest.fn().mockResolvedValueOnce({ data: '<input type="hidden" name="csrfmiddlewaretoken" value="activation-csrf">' });
    const post = jest.fn().mockResolvedValueOnce({ data: "<html>Activation Réussie</html>" });
    const audit = { record: jest.fn().mockResolvedValue({}) };
    const service = new BioTimeLicenseService(
      config({
        BIOTIME_BASE_URL: "http://biotime.local",
        BIOTIME_USERNAME: "admin",
        BIOTIME_PASSWORD: "secret",
        BIOTIME_LICENSE_FILE_PATH: filePath
      }) as never,
      audit as never,
      (_jar: CookieJar) => ({ get, post } as never)
    );

    const result = await service.reactivate();

    expect(result.success).toBe(true);
    expect(get).toHaveBeenCalledWith("/offlineActivation/");
    expect(post).toHaveBeenCalledWith("/offlineActivation/", expect.anything(), expect.objectContaining({
      headers: expect.objectContaining({ "X-CSRFToken": "activation-csrf" })
    }));
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({
      action: "biotime.license_reactivation",
      metadata: expect.objectContaining({ success: true })
    }));
  });

  it("journalise et remonte un refus d'activation BioTime", async () => {
    const service = new BioTimeLicenseService(
      config({
        BIOTIME_BASE_URL: "http://biotime.local",
        BIOTIME_USERNAME: "admin",
        BIOTIME_PASSWORD: "bad",
        BIOTIME_LICENSE_FILE_PATH: filePath
      }) as never,
      { record: jest.fn().mockResolvedValue({}) } as never,
      () => ({
        get: jest.fn().mockResolvedValue({ data: '<input type="hidden" name="csrfmiddlewaretoken" value="login-csrf">' }),
        post: jest.fn().mockResolvedValue({ data: "<html><body>Invalid license file</body></html>" })
      } as never)
    );

    await expect(service.reactivate()).rejects.toThrow("Invalid license file");
  });

  it("reconnaît la réponse JSON Successfully Activated de BioTime", async () => {
    const service = new BioTimeLicenseService(
      config({ BIOTIME_BASE_URL: "http://biotime.local", BIOTIME_USERNAME: "admin", BIOTIME_PASSWORD: "secret", BIOTIME_LICENSE_FILE_PATH: filePath }) as never,
      { record: jest.fn().mockResolvedValue({}) } as never,
      () => ({
        get: jest.fn().mockResolvedValue({ data: '<input type="hidden" name="csrfmiddlewaretoken" value="activation-csrf">' }),
        post: jest.fn().mockResolvedValue({ data: { message: "Successfully Activated" } })
      } as never)
    );
    await expect(service.reactivate()).resolves.toEqual(expect.objectContaining({ success: true }));
  });
});
