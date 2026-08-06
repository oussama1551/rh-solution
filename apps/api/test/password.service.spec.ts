import { PasswordService } from "../src/auth/password.service";

describe("PasswordService", () => {
  const service = new PasswordService();

  it("hashes and verifies a password", async () => {
    const hash = await service.hash("StrongPassword123!");

    expect(hash).not.toBe("StrongPassword123!");
    await expect(service.verify(hash, "StrongPassword123!")).resolves.toBe(true);
    await expect(service.verify(hash, "wrong-password")).resolves.toBe(false);
  });
});
