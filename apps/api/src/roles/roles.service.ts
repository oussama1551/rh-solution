import { Injectable, NotFoundException } from "@nestjs/common";
import { ALL_PERMISSIONS } from "../permissions/permission-codes";
import { PrismaService } from "../prisma/prisma.service";
import { DEFAULT_ROLES } from "./default-roles";
import { UpdateRolePermissionsDto } from "./dto/update-role-permissions.dto";

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  listRoles() {
    return this.prisma.role.findMany({
      orderBy: { code: "asc" },
      include: {
        permissions: {
          include: { permission: true }
        }
      }
    });
  }

  listPermissions() {
    return this.prisma.permission.findMany({
      orderBy: [{ module: "asc" }, { action: "asc" }]
    });
  }

  async updateRolePermissions(code: string, dto: UpdateRolePermissionsDto) {
    const role = await this.prisma.role.findUnique({ where: { code } });
    if (!role) throw new NotFoundException("Rôle introuvable.");

    const uniquePermissionCodes = [...new Set(dto.permissionCodes)];
    const permissions = await this.prisma.permission.findMany({
      where: { code: { in: uniquePermissionCodes } }
    });
    if (permissions.length !== uniquePermissionCodes.length) {
      throw new NotFoundException("Une ou plusieurs permissions sont introuvables.");
    }

    await this.prisma.$transaction(async tx => {
      await tx.rolePermission.deleteMany({ where: { roleId: role.id } });
      await tx.rolePermission.createMany({
        data: permissions.map(permission => ({
          roleId: role.id,
          permissionId: permission.id
        })),
        skipDuplicates: true
      });
    });

    return this.prisma.role.findUniqueOrThrow({
      where: { code },
      include: {
        permissions: {
          include: { permission: true }
        }
      }
    });
  }

  async seedDefaults() {
    for (const permission of ALL_PERMISSIONS) {
      await this.prisma.permission.upsert({
        where: { code: permission.code },
        update: {
          module: permission.module,
          action: permission.action,
          description: permission.description
        },
        create: permission
      });
    }

    for (const role of DEFAULT_ROLES) {
      const savedRole = await this.prisma.role.upsert({
        where: { code: role.code },
        update: {
          name: role.name,
          description: role.description
        },
        create: {
          code: role.code,
          name: role.name,
          description: role.description
        }
      });

      const permissions = await this.prisma.permission.findMany({
        where: { code: { in: [...role.permissions] } }
      });

      await this.prisma.rolePermission.deleteMany({ where: { roleId: savedRole.id } });
      await this.prisma.rolePermission.createMany({
        data: permissions.map(permission => ({
          roleId: savedRole.id,
          permissionId: permission.id
        })),
        skipDuplicates: true
      });
    }
  }
}
