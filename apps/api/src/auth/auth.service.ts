import { Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { createHash } from "crypto";
import { AuditService } from "../audit/audit.service";
import { RequestUser } from "../common/request-user.type";
import { PrismaService } from "../prisma/prisma.service";
import { LoginDto } from "./dto/login.dto";
import { PasswordService } from "./password.service";

type LoginContext = {
  ipAddress?: string | null;
  userAgent?: string | null;
};

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly passwords: PasswordService,
    private readonly audit: AuditService
  ) {}

  async login(dto: LoginDto, context: LoginContext = {}) {
    try {
      const user = await this.prisma.user.findUnique({
        where: { username: dto.username },
        include: {
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
          }
        }
      });

      if (!user || !user.isActive || !(await this.passwords.verify(user.passwordHash, dto.password))) {
        await this.audit.record({
          action: "auth.login_failed",
          entityType: "user",
          metadata: { username: dto.username },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent
        });
        throw new UnauthorizedException("Identifiants invalides.");
      }

      const expiresAt = this.computeExpiry();
      const session = await this.prisma.session.create({
        data: {
          userId: user.id,
          tokenHash: "pending",
          expiresAt
        }
      });

      const token = await this.jwt.signAsync({
        sub: user.id,
        username: user.username,
        sid: session.id
      });

      await this.prisma.session.update({
        where: { id: session.id },
        data: { tokenHash: this.hashToken(token) }
      });

      await this.prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() }
      });

      await this.audit.record({
        userId: user.id,
        action: "auth.login",
        entityType: "user",
        entityId: user.id,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent
      });

      return {
        accessToken: token,
        user: this.toRequestUser(user, session.id),
        expiresAt
      };
    } catch (error) {
      if (!(error instanceof UnauthorizedException)) {
        this.logger.error(`Login failed unexpectedly for ${dto.username}: ${error instanceof Error ? error.message : String(error)}`);
      }
      throw error;
    }
  }

  async logout(user: RequestUser | undefined, token: string | undefined) {
    if (!user?.sessionId) return { ok: true };

    await this.prisma.session.updateMany({
      where: {
        id: user.sessionId,
        userId: user.id,
        tokenHash: token ? this.hashToken(token) : undefined,
        revokedAt: null
      },
      data: { revokedAt: new Date() }
    });

    await this.audit.record({
      userId: user.id,
      action: "auth.logout",
      entityType: "session",
      entityId: user.sessionId
    });

    return { ok: true };
  }

  async validateSession(userId: string, sessionId: string, token: string): Promise<RequestUser | null> {
    const session = await this.prisma.session.findFirst({
      where: {
        id: sessionId,
        userId,
        tokenHash: this.hashToken(token),
        revokedAt: null,
        expiresAt: { gt: new Date() }
      },
      include: {
        user: {
          include: {
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
            }
          }
        }
      }
    });

    if (!session?.user?.isActive) return null;
    return this.toRequestUser(session.user, session.id);
  }

  extractTokenFromRequest(request: { headers?: Record<string, unknown>; cookies?: Record<string, string> }) {
    const auth = request.headers?.authorization;
    if (typeof auth === "string" && auth.startsWith("Bearer ")) {
      return auth.slice(7);
    }

    const cookieName = this.config.get<string>("SESSION_COOKIE_NAME", "rh_session");
    return request.cookies?.[cookieName];
  }

  hashToken(token: string) {
    return createHash("sha256").update(token).digest("hex");
  }

  private computeExpiry() {
    const raw = this.config.get<string>("JWT_EXPIRES_IN", "8h");
    const match = /^(\d+)([hm])$/.exec(raw);
    const ms = match
      ? Number(match[1]) * (match[2] === "h" ? 60 * 60 * 1000 : 60 * 1000)
      : 8 * 60 * 60 * 1000;
    return new Date(Date.now() + ms);
  }

  private toRequestUser(user: {
    id: string;
    username: string;
    roles: Array<{
      role: {
        code: string;
        permissions: Array<{ permission: { code: string } }>;
      };
    }>;
  }, sessionId?: string): RequestUser {
    const roles = user.roles.map(item => item.role.code);
    const permissions = new Set<string>();

    for (const userRole of user.roles) {
      for (const rolePermission of userRole.role.permissions) {
        permissions.add(rolePermission.permission.code);
      }
    }

    return {
      id: user.id,
      username: user.username,
      roles,
      permissions: [...permissions],
      sessionId
    };
  }
}
