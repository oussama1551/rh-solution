import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import { PasswordService } from "../auth/password.service";
import { RequestUser } from "../common/request-user.type";
import { PrismaService } from "../prisma/prisma.service";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateUserDto } from "./dto/update-user.dto";

const userInclude = {
  roles: {
    include: {
      role: {
        include: {
          permissions: {
            include: { permission: true }
          }
        }
      }
    }
  },
  subUnitAccess: {
    include: { subUnit: { include: { unit: true } } }
  }
} satisfies Prisma.UserInclude;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly audit: AuditService
  ) {}

  async list() {
    const users = await this.prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      include: userInclude
    });
    return users.map(user => this.sanitize(user));
  }

  async get(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: userInclude
    });
    if (!user) throw new NotFoundException("Utilisateur introuvable.");
    return this.sanitize(user);
  }

  async create(dto: CreateUserDto, actor?: RequestUser) {
    await this.ensureUnique(dto.username, dto.email);
    const roles = await this.resolveRoles(dto.roleCodes);

    const user = await this.prisma.user.create({
      data: {
        username: dto.username,
        email: dto.email,
        fullName: dto.fullName,
        passwordHash: await this.passwords.hash(dto.password),
        roles: {
          create: roles.map(role => ({ roleId: role.id }))
        }
      },
      include: userInclude
    });

    const sanitized = this.sanitize(user);
    await this.audit.record({
      userId: actor?.id,
      action: "users.create",
      entityType: "user",
      entityId: user.id,
      after: sanitized
    });

    return sanitized;
  }

  async update(id: string, dto: UpdateUserDto, actor?: RequestUser) {
    const existing = await this.prisma.user.findUnique({
      where: { id },
      include: userInclude
    });
    if (!existing) throw new NotFoundException("Utilisateur introuvable.");

    if (dto.username || dto.email) {
      await this.ensureUnique(dto.username || existing.username, dto.email, id);
    }

    const roles = dto.roleCodes ? await this.resolveRoles(dto.roleCodes) : null;
    const updated = await this.prisma.$transaction(async tx => {
      if (roles) {
        await tx.userRole.deleteMany({ where: { userId: id } });
        await tx.userRole.createMany({
          data: roles.map(role => ({ userId: id, roleId: role.id })),
          skipDuplicates: true
        });
      }

      return tx.user.update({
        where: { id },
        data: {
          username: dto.username,
          email: dto.email,
          fullName: dto.fullName,
          isActive: dto.isActive,
          passwordHash: dto.password ? await this.passwords.hash(dto.password) : undefined
        },
        include: userInclude
      });
    });

    const before = this.sanitize(existing);
    const after = this.sanitize(updated);
    await this.audit.record({
      userId: actor?.id,
      action: "users.update",
      entityType: "user",
      entityId: id,
      before,
      after
    });

    return after;
  }

  async deactivate(id: string, actor?: RequestUser) {
    const before = await this.get(id);
    const user = await this.prisma.user.update({
      where: { id },
      data: { isActive: false },
      include: userInclude
    });
    await this.prisma.session.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date() }
    });

    const after = this.sanitize(user);
    await this.audit.record({
      userId: actor?.id,
      action: "users.deactivate",
      entityType: "user",
      entityId: id,
      before,
      after
    });
    return after;
  }

  async updateOrgAccess(id: string, subUnitIds: string[], actor?: RequestUser) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: userInclude
    });
    if (!user) throw new NotFoundException("Utilisateur introuvable.");

    const uniqueIds = [...new Set(subUnitIds)];
    const subUnits = uniqueIds.length
      ? await this.prisma.subUnit.findMany({ where: { id: { in: uniqueIds } } })
      : [];
    if (subUnits.length !== uniqueIds.length) {
      throw new NotFoundException("Une ou plusieurs sous-unités sont introuvables.");
    }

    const updated = await this.prisma.$transaction(async tx => {
      await tx.userSubUnitAccess.deleteMany({ where: { userId: id } });
      if (uniqueIds.length) {
        await tx.userSubUnitAccess.createMany({
          data: uniqueIds.map(subUnitId => ({ userId: id, subUnitId })),
          skipDuplicates: true
        });
      }
      return tx.user.findUniqueOrThrow({ where: { id }, include: userInclude });
    });

    await this.audit.record({
      userId: actor?.id,
      action: "users.org_access.update",
      entityType: "user",
      entityId: id,
      before: { subUnitIds: user.subUnitAccess.map(item => item.subUnitId) } as Prisma.InputJsonValue,
      after: { subUnitIds: uniqueIds } as Prisma.InputJsonValue
    });

    return this.sanitize(updated);
  }

  private async ensureUnique(username: string, email?: string, exceptId?: string) {
    const existing = await this.prisma.user.findFirst({
      where: {
        OR: [
          { username },
          ...(email ? [{ email }] : [])
        ],
        NOT: exceptId ? { id: exceptId } : undefined
      }
    });
    if (existing) throw new ConflictException("Nom d'utilisateur ou email déjà utilisé.");
  }

  private async resolveRoles(roleCodes: string[]) {
    const roles = await this.prisma.role.findMany({
      where: { code: { in: roleCodes } }
    });
    if (roles.length !== new Set(roleCodes).size) {
      throw new NotFoundException("Un ou plusieurs rôles sont introuvables.");
    }
    return roles;
  }

  private sanitize(user: Prisma.UserGetPayload<{ include: typeof userInclude }>) {
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      fullName: user.fullName,
      isActive: user.isActive,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      roles: user.roles.map(userRole => ({
        code: userRole.role.code,
        name: userRole.role.name,
        permissions: userRole.role.permissions.map(item => item.permission.code)
      })),
      orgAccess: user.subUnitAccess.map(item => ({
        subUnitId: item.subUnitId,
        subUnitName: item.subUnit.name,
        unitId: item.subUnit.unitId,
        unitName: item.subUnit.unit.name
      })).sort((left, right) => `${left.unitName} ${left.subUnitName}`.localeCompare(`${right.unitName} ${right.subUnitName}`))
    };
  }
}
