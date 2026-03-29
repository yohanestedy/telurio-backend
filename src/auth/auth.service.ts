import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma';
import { UnauthorizedException } from '../common/utils';
import { LoginDto, ChangePasswordDto } from './dto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async login(dto: LoginDto) {
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

    const payload = { sub: user.id, username: user.username, role: user.role };
    const token = this.jwtService.sign(payload);

    return {
      token,
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

    return { message: 'Password updated successfully' };
  }
}
