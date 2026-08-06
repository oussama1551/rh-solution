import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { AuthService } from "./auth.service";
import { JwtPayload } from "./jwt.payload";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly auth: AuthService
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        request => {
          const cookieName = config.get<string>("SESSION_COOKIE_NAME", "rh_session");
          return request?.cookies?.[cookieName] || null;
        }
      ]),
      ignoreExpiration: false,
      secretOrKey: config.get<string>("JWT_SECRET", "dev-secret-change-me"),
      passReqToCallback: true
    });
  }

  async validate(request: { headers?: Record<string, unknown>; cookies?: Record<string, string> }, payload: JwtPayload) {
    const token = this.auth.extractTokenFromRequest(request);
    if (!token) return null;
    return this.auth.validateSession(payload.sub, payload.sid, token);
  }
}
