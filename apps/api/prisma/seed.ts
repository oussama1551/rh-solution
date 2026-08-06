import { PrismaClient } from "@prisma/client";
import * as argon2 from "argon2";
import { ALL_PERMISSIONS } from "../src/permissions/permission-codes";
import { DEFAULT_ROLES } from "../src/roles/default-roles";
import { RoleCode } from "../src/roles/role-codes";

const prisma = new PrismaClient();

async function main() {
  for (const permission of ALL_PERMISSIONS) {
    await prisma.permission.upsert({
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
    const savedRole = await prisma.role.upsert({
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

    const permissions = await prisma.permission.findMany({
      where: { code: { in: [...role.permissions] } }
    });

    await prisma.rolePermission.deleteMany({ where: { roleId: savedRole.id } });
    await prisma.rolePermission.createMany({
      data: permissions.map(permission => ({
        roleId: savedRole.id,
        permissionId: permission.id
      })),
      skipDuplicates: true
    });
  }

  const adminRole = await prisma.role.findUniqueOrThrow({ where: { code: RoleCode.Admin } });
  const adminPassword = process.env.ADMIN_PASSWORD || "Solo2620";
  const admin = await prisma.user.upsert({
    where: { username: "admin" },
    update: {},
    create: {
      username: "admin",
      email: "admin@rh-solution.local",
      fullName: "Administrateur RH Solution",
      passwordHash: await argon2.hash(adminPassword, { type: argon2.argon2id }),
      roles: {
        create: [{ roleId: adminRole.id }]
      }
    }
  });

  await prisma.auditLog.create({
    data: {
      action: "system.seed",
      entityType: "user",
      entityId: admin.id,
      metadata: { username: admin.username }
    }
  });
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async error => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
