import { Controller, Post, Get, Patch, Body, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto, ChangePasswordDto } from './dto';
import { Public, CurrentUser } from '../common/decorators';
import { UnauthorizedException } from '../common/utils';
import type { AuthenticatedUser } from './strategies/jwt.strategy';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Public()
  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(dto, {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    res.cookie(
      result.refreshCookieName,
      result.refreshToken,
      this.authService.getRefreshCookieOptions(),
    );
    const { refreshToken, refreshCookieName, ...responseBody } = result;
    return responseBody;
  }

  @Public()
  @Post('refresh')
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const cookieName = this.authService.getCookieName();
    const refreshToken = req.cookies?.[cookieName];
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token is required');
    }

    const result = await this.authService.refresh(refreshToken);
    res.cookie(
      result.refreshCookieName,
      result.refreshToken,
      this.authService.getRefreshCookieOptions(),
    );
    const { refreshToken: _rt, refreshCookieName, ...responseBody } = result;
    return responseBody;
  }

  @Public()
  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const cookieName = this.authService.getCookieName();
    const refreshToken = req.cookies?.[cookieName];
    const result = await this.authService.logout(refreshToken);
    res.clearCookie(cookieName, this.authService.getRefreshCookieOptions());
    return result;
  }

  @Post('logout-all')
  async logoutAll(
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.logoutAll(user.id);
    res.clearCookie(
      this.authService.getCookieName(),
      this.authService.getRefreshCookieOptions(),
    );
    return result;
  }

  @Get('me')
  async getMe(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.getMe(user.id);
  }

  @Patch('me/password')
  async changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(user.id, dto);
  }
}
