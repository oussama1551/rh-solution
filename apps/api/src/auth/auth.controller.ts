import { Body, Controller, Post, Req, Res } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Response } from "express";
import { CurrentUser } from "./decorators/current-user.decorator";
import { Public } from "./decorators/public.decorator";
import { AuthService } from "./auth.service";
import { LoginDto } from "./dto/login.dto";
import { RequestUser } from "../common/request-user.type";
import { RequestWithUser } from "../common/request-with-user.type";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService
  ) {}

  @Public()
  @Post("login")
  async login(@Body() dto: LoginDto, @Req() req: RequestWithUser, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.login(dto, {
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"]
    });

    res.cookie(this.config.get<string>("SESSION_COOKIE_NAME", "rh_session"), result.accessToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      expires: result.expiresAt
    });

    return result;
  }

  @Post("logout")
  async logout(@CurrentUser() user: RequestUser, @Req() req: RequestWithUser, @Res({ passthrough: true }) res: Response) {
    const token = this.auth.extractTokenFromRequest(req);
    const result = await this.auth.logout(user, token);
    res.clearCookie(this.config.get<string>("SESSION_COOKIE_NAME", "rh_session"));
    return result;
  }

  @Post("me")
  me(@CurrentUser() user: RequestUser) {
    return { user };
  }
}
