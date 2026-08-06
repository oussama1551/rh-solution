import { UnauthorizedException } from "@nestjs/common";
import { AuthService } from "../src/auth/auth.service";

describe("AuthService", () => {
  const userRecord = {
    id: "user-1",
    username: "admin",
    passwordHash: "hashed",
    isActive: true,
    roles: [
      {
        role: {
          code: "ADMIN",
          permissions: [
            { permission: { code: "users.manage" } },
            { permission: { code: "reports.read" } }
          ]
        }
      }
    ]
  };

  function makeService(overrides: Record<string, unknown> = {}) {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue(userRecord),
        update: jest.fn().mockResolvedValue({})
      },
      session: {
        create: jest.fn().mockResolvedValue({
          id: "session-1",
          expiresAt: new Date(Date.now() + 3600000)
        }),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({}),
        findFirst: jest.fn()
      }
    };
    const jwt = {
      signAsync: jest.fn().mockResolvedValue("jwt-token")
    };
    const config = {
      get: jest.fn((key: string, fallback: string) => fallback)
    };
    const passwords = {
      verify: jest.fn().mockResolvedValue(true),
      hash: jest.fn()
    };
    const audit = {
      record: jest.fn().mockResolvedValue({})
    };

    const service = new AuthService(
      (overrides.prisma || prisma) as any,
      (overrides.jwt || jwt) as any,
      (overrides.config || config) as any,
      (overrides.passwords || passwords) as any,
      (overrides.audit || audit) as any
    );

    return { service, prisma, jwt, config, passwords, audit };
  }

  it("logs in and returns a JWT with roles and permissions", async () => {
    const { service, prisma, jwt, audit } = makeService();

    const result = await service.login({ username: "admin", password: "Password123!" });

    expect(result.accessToken).toBe("jwt-token");
    expect(result.user.permissions).toEqual(["users.manage", "reports.read"]);
    expect(prisma.session.create).toHaveBeenCalled();
    expect(jwt.signAsync).toHaveBeenCalledWith({
      sub: "user-1",
      username: "admin",
      sid: "session-1"
    });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "auth.login" }));
  });

  it("rejects invalid credentials and audits failure", async () => {
    const { service, passwords, audit } = makeService();
    passwords.verify.mockResolvedValue(false);

    await expect(service.login({ username: "admin", password: "bad-password" })).rejects.toBeInstanceOf(UnauthorizedException);
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "auth.login_failed" }));
  });
});
