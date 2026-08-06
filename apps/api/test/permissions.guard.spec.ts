import { ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { PermissionsGuard } from "../src/auth/guards/permissions.guard";

function createContext(userPermissions: string[], requiredPermissions: string[]) {
  return {
    getHandler: () => "handler",
    getClass: () => "class",
    switchToHttp: () => ({
      getRequest: () => ({
        user: {
          id: "u1",
          username: "admin",
          roles: ["ADMIN"],
          permissions: userPermissions
        }
      })
    })
  } as any;
}

describe("PermissionsGuard", () => {
  it("allows a user with all required permissions", () => {
    const reflector = {
      getAllAndOverride: jest.fn()
        .mockReturnValueOnce(false)
        .mockReturnValueOnce(["users.manage"])
    } as unknown as Reflector;
    const guard = new PermissionsGuard(reflector);

    expect(guard.canActivate(createContext(["users.manage"], ["users.manage"]))).toBe(true);
  });

  it("rejects a user missing a required permission", () => {
    const reflector = {
      getAllAndOverride: jest.fn()
        .mockReturnValueOnce(false)
        .mockReturnValueOnce(["users.manage"])
    } as unknown as Reflector;
    const guard = new PermissionsGuard(reflector);

    expect(() => guard.canActivate(createContext(["users.read"], ["users.manage"]))).toThrow(ForbiddenException);
  });

  it("allows public routes", () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValueOnce(true)
    } as unknown as Reflector;
    const guard = new PermissionsGuard(reflector);

    expect(guard.canActivate(createContext([], []))).toBe(true);
  });
});
