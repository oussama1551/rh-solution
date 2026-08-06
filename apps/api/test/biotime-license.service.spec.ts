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

  it("réactive la licence avec login web, CSRF et upload multipart", async () => {
    const get = jest.fn()
      .mockResolvedValueOnce({ data: '<input type="hidden" name="csrfmiddlewaretoken" value="login-csrf">' })
      .mockResolvedValueOnce({ data: '<input type="hidden" name="csrfmiddlewaretoken" value="activation-csrf">' });
    const post = jest.fn()
      .mockResolvedValueOnce({ data: { ret: 0 } })
      .mockResolvedValueOnce({ data: "<html>Activation Réussie</html>" });
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
    expect(get).toHaveBeenNthCalledWith(1, "/login/");
    expect(post).toHaveBeenNthCalledWith(1, "/login/", expect.stringContaining("username=admin"), expect.objectContaining({
      headers: expect.objectContaining({ "X-CSRFToken": "login-csrf" })
    }));
    expect(get).toHaveBeenNthCalledWith(2, "/offlineActivation/");
    expect(post).toHaveBeenNthCalledWith(2, "/offlineActivation/", expect.anything(), expect.objectContaining({
      headers: expect.objectContaining({ "X-CSRFToken": "activation-csrf" })
    }));
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({
      action: "biotime.license_reactivation",
      metadata: expect.objectContaining({ success: true })
    }));
  });

  it("journalise et remonte un échec de login web", async () => {
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
        post: jest.fn().mockResolvedValue({ data: { ret: 1, message: "invalid credentials" } })
      } as never)
    );

    await expect(service.reactivate()).rejects.toThrow("Login web BioTime refusé");
  });
});
