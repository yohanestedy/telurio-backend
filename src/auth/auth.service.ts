import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma';
import { generateUuidV7 } from '../common/utils';
import { UnauthorizedException } from '../common/utils';
import { LoginDto, ChangePasswordDto } from './dto';

@Injectable()
export class AuthService {
  private readonly cookieName: string;
  private readonly accessSecret: string;
  private readonly refreshSecret: string;
  private readonly accessExpiresIn: string;
  private readonly refreshExpiresIn: string;

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {
    this.accessSecret =
      this.configService.getOrThrow<string>('JWT_ACCESS_SECRET');
    this.refreshSecret =
      this.configService.getOrThrow<string>('JWT_REFRESH_SECRET');
    this.accessExpiresIn = this.configService.getOrThrow<string>(
      'JWT_ACCESS_EXPIRES_IN',
    );
    this.refreshExpiresIn = this.configService.get<string>(
      'JWT_REFRESH_EXPIRES_IN',
      '14d',
    );
    this.cookieName = this.configService.get<string>(
      'AUTH_COOKIE_NAME',
      'telurio_rt',
    );
  }

  async login(dto: LoginDto, meta: { ipAddress?: string; userAgent?: string }) {
    const user = await this.prisma.user.findUnique({
      where: { username: dto.username },
      include: {
        coopAccesses: {
          where: { deletedAt: null },
          include: { coop: { select: { id: true, name: true } } },
        },
      },
    });

    if (!user || user.deletedAt || !user.isActive) {
      throw new UnauthorizedException('Invalid username or password');
    }

    const passwordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordValid) {
      throw new UnauthorizedException('Invalid username or password');
    }

    const sessionId = generateUuidV7();
    const refreshToken = this.signRefreshToken({
      sub: user.id,
      username: user.username,
      role: user.role,
      jti: sessionId,
    });
    const accessToken = this.signAccessToken({
      sub: user.id,
      username: user.username,
      role: user.role,
    });

    await this.prisma.userSession.create({
      data: {
        id: generateUuidV7(),
        userId: user.id,
        sessionId,
        refreshTokenHash: this.hashToken(refreshToken),
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        expiresAt: this.getRefreshExpiryDate(),
      },
    });

    return {
      token: accessToken,
      accessToken,
      refreshToken,
      refreshCookieName: this.cookieName,
      user: {
        id: user.id,
        name: user.name,
        username: user.username,
        role: user.role,
        isActive: user.isActive,
        coopAccesses: user.coopAccesses.map((access) => ({
          coopId: access.coop.id,
          coopName: access.coop.name,
          ownershipSharePercent: access.ownershipSharePercent
            ? access.ownershipSharePercent.toString()
            : null,
        })),
      },
    };
  }

  async refresh(refreshToken: string) {
    const payload = this.verifyRefreshToken(refreshToken);
    const now = new Date();
    const existingSession = await this.prisma.userSession.findFirst({
      where: {
        userId: payload.sub,
        sessionId: payload.jti,
        revokedAt: null,
        expiresAt: { gt: now },
      },
    });

    if (!existingSession) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const incomingHash = this.hashToken(refreshToken);
    if (incomingHash !== existingSession.refreshTokenHash) {
      await this.prisma.userSession.update({
        where: { id: existingSession.id },
        data: { revokedAt: now, updatedAt: now },
      });
      throw new UnauthorizedException('Invalid refresh token');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });
    if (!user || user.deletedAt || !user.isActive) {
      throw new UnauthorizedException('User not found or inactive');
    }

    const newSessionId = generateUuidV7();
    const newRefreshToken = this.signRefreshToken({
      sub: user.id,
      username: user.username,
      role: user.role,
      jti: newSessionId,
    });
    const accessToken = this.signAccessToken({
      sub: user.id,
      username: user.username,
      role: user.role,
    });

    await this.prisma.$transaction([
      this.prisma.userSession.update({
        where: { id: existingSession.id },
        data: { revokedAt: now, lastUsedAt: now, updatedAt: now },
      }),
      this.prisma.userSession.create({
        data: {
          id: generateUuidV7(),
          userId: user.id,
          sessionId: newSessionId,
          refreshTokenHash: this.hashToken(newRefreshToken),
          ipAddress: existingSession.ipAddress,
          userAgent: existingSession.userAgent,
          expiresAt: this.getRefreshExpiryDate(),
          lastUsedAt: now,
        },
      }),
    ]);

    return {
      accessToken,
      token: accessToken,
      refreshToken: newRefreshToken,
      refreshCookieName: this.cookieName,
    };
  }

  async logout(refreshToken?: string) {
    if (refreshToken) {
      const payload = this.verifyRefreshToken(refreshToken, true);
      if (payload) {
        await this.prisma.userSession.updateMany({
          where: {
            userId: payload.sub,
            sessionId: payload.jti,
            revokedAt: null,
          },
          data: { revokedAt: new Date(), updatedAt: new Date() },
        });
      }
    }
    return { success: true };
  }

  async logoutAll(userId: string) {
    const result = await this.prisma.userSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date(), updatedAt: new Date() },
    });
    return { success: true, revokedSessions: result.count };
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        coopAccesses: {
          where: { deletedAt: null },
          include: { coop: { select: { id: true, name: true } } },
        },
      },
    });

    if (!user || user.deletedAt || !user.isActive) {
      throw new UnauthorizedException('User not found or inactive');
    }

    return {
      id: user.id,
      name: user.name,
      username: user.username,
      role: user.role,
      isActive: user.isActive,
      coopAccesses: user.coopAccesses.map((access) => ({
        coopId: access.coop.id,
        coopName: access.coop.name,
        ownershipSharePercent: access.ownershipSharePercent
          ? access.ownershipSharePercent.toString()
          : null,
      })),
    };
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || user.deletedAt) {
      throw new UnauthorizedException('User not found');
    }

    const passwordValid = await bcrypt.compare(
      dto.currentPassword,
      user.passwordHash,
    );
    if (!passwordValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const saltRounds = 10;
    const newHash = await bcrypt.hash(dto.newPassword, saltRounds);

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash: newHash,
        updatedById: userId,
        updatedAt: new Date(),
      },
    });

    await this.prisma.userSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date(), updatedAt: new Date() },
    });

    return { message: 'Password updated successfully' };
  }

  getCookieName() {
    return this.cookieName;
  }

  getRefreshCookieOptions() {
    const sameSite = this.configService.get<string>(
      'AUTH_COOKIE_SAME_SITE',
      'lax',
    ) as 'lax' | 'strict' | 'none';
    return {
      httpOnly: true,
      secure:
        this.configService.get<string>('AUTH_COOKIE_SECURE', 'false') ===
        'true',
      sameSite,
      path: '/',
      maxAge: this.parseMs(this.refreshExpiresIn),
    };
  }

  private signAccessToken(payload: {
    sub: string;
    username: string;
    role: string;
  }) {
    return this.jwtService.sign(payload, {
      secret: this.accessSecret,
      expiresIn: this.accessExpiresIn as unknown as number,
    });
  }

  private signRefreshToken(payload: {
    sub: string;
    username: string;
    role: string;
    jti: string;
  }) {
    return this.jwtService.sign(payload, {
      secret: this.refreshSecret,
      expiresIn: this.refreshExpiresIn as unknown as number,
    });
  }

  private verifyRefreshToken(token: string): {
    sub: string;
    username: string;
    role: string;
    jti: string;
  };
  private verifyRefreshToken(
    token: string,
    suppressError: true,
  ): {
    sub: string;
    username: string;
    role: string;
    jti: string;
  } | null;
  private verifyRefreshToken(token: string, suppressError = false) {
    try {
      return this.jwtService.verify<{
        sub: string;
        username: string;
        role: string;
        jti: string;
      }>(token, { secret: this.refreshSecret });
    } catch {
      if (suppressError) return null;
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  private hashToken(token: string) {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private getRefreshExpiryDate() {
    return new Date(Date.now() + this.parseMs(this.refreshExpiresIn));
  }

  private parseMs(duration: string) {
    const match = duration.match(/^(\d+)([smhd])$/i);
    if (!match) return 14 * 24 * 60 * 60 * 1000;
    const value = Number(match[1]);
    const unit = match[2].toLowerCase();
    const factor =
      unit === 's'
        ? 1000
        : unit === 'm'
          ? 60000
          : unit === 'h'
            ? 3600000
            : 86400000;
    return value * factor;
  }
}
