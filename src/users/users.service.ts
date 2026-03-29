import { Injectable } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma';
import { generateUuidV7 } from '../common';
import {
  BusinessRuleException,
  ConflictException,
  NotFoundException,
} from '../common';
import {
  CreateUserCoopAccessDto,
  CreateUserDto,
  QueryUsersDto,
  UpdateUserDto,
} from './dto';

interface AuthUserContext {
  id: string;
}

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async listUsers(query: QueryUsersDto) {
    const where: Prisma.UserWhereInput = {
      deletedAt: null,
      ...(query.role ? { role: query.role } : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(query.coopId
        ? {
            coopAccesses: {
              some: { coopId: query.coopId, deletedAt: null },
            },
          }
        : {}),
    };

    const [total, users] = await this.prisma.$transaction([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        skip: query.skip,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          username: true,
          role: true,
          isActive: true,
          createdAt: true,
          coopAccesses: {
            where: { deletedAt: null },
            orderBy: { createdAt: 'asc' },
            select: {
              coopId: true,
              ownershipSharePercent: true,
              coop: { select: { name: true } },
            },
          },
        },
      }),
    ]);

    return {
      data: users.map((user) => ({
        id: user.id,
        name: user.name,
        username: user.username,
        role: user.role,
        isActive: user.isActive,
        createdAt: user.createdAt,
        coopAccesses: user.coopAccesses.map((access) => ({
          coopId: access.coopId,
          coopName: access.coop.name,
          ownershipSharePercent: access.ownershipSharePercent
            ? access.ownershipSharePercent.toString()
            : null,
        })),
      })),
      meta: {
        total,
        page: query.page,
        limit: query.limit,
      },
    };
  }

  async createUser(actor: AuthUserContext, dto: CreateUserDto) {
    const existing = await this.prisma.user.findUnique({
      where: { username: dto.username },
      select: { id: true, deletedAt: true },
    });

    if (existing && !existing.deletedAt) {
      throw new ConflictException('Username already in use');
    }

    await this.validateCoopAccesses(dto.coopAccesses);

    const userId = generateUuidV7();
    const passwordHash = await bcrypt.hash(dto.password, 10);

    await this.prisma.$transaction(async (tx) => {
      await tx.user.create({
        data: {
          id: userId,
          name: dto.name,
          username: dto.username,
          passwordHash,
          role: dto.role,
          createdById: actor.id,
        },
      });

      if (dto.coopAccesses && dto.coopAccesses.length > 0) {
        await tx.userCoopAccess.createMany({
          data: dto.coopAccesses.map((access) => ({
            id: generateUuidV7(),
            userId,
            coopId: access.coopId,
            ownershipSharePercent:
              dto.role === Role.OWNER
                ? (access.ownershipSharePercent ?? null)
                : null,
            createdById: actor.id,
          })),
        });
      }
    });

    return this.getUserById(userId);
  }

  async updateUser(userId: string, actor: AuthUserContext, dto: UpdateUserDto) {
    const existing = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, deletedAt: true },
    });

    if (!existing || existing.deletedAt) {
      throw new NotFoundException('User not found');
    }

    if (
      existing.role === Role.ADMIN &&
      dto.coopAccesses &&
      dto.coopAccesses.length > 0
    ) {
      throw new BusinessRuleException(
        'ADMIN account cannot be assigned to coops',
      );
    }

    await this.validateCoopAccesses(dto.coopAccesses);

    await this.prisma.$transaction(async (tx) => {
      const updateData: Prisma.UserUpdateInput = {
        updatedById: actor.id,
        updatedAt: new Date(),
      };

      if (dto.name !== undefined) {
        updateData.name = dto.name;
      }
      if (dto.isActive !== undefined) {
        updateData.isActive = dto.isActive;
      }

      await tx.user.update({
        where: { id: userId },
        data: updateData,
      });

      if (dto.coopAccesses !== undefined) {
        await tx.userCoopAccess.updateMany({
          where: {
            userId,
            deletedAt: null,
          },
          data: {
            deletedAt: new Date(),
            deletedById: actor.id,
            deleteReason: 'Assignment replaced via user update',
            updatedById: actor.id,
          },
        });

        if (dto.coopAccesses.length > 0) {
          await tx.userCoopAccess.createMany({
            data: dto.coopAccesses.map((access) => ({
              id: generateUuidV7(),
              userId,
              coopId: access.coopId,
              ownershipSharePercent:
                existing.role === Role.OWNER
                  ? (access.ownershipSharePercent ?? null)
                  : null,
              createdById: actor.id,
            })),
          });
        }
      }
    });

    return this.getUserById(userId);
  }

  private async validateCoopAccesses(coopAccesses?: CreateUserCoopAccessDto[]) {
    if (!coopAccesses || coopAccesses.length === 0) {
      return;
    }

    const uniqueCoopIds = [
      ...new Set(coopAccesses.map((access) => access.coopId)),
    ];

    const coops = await this.prisma.coop.findMany({
      where: {
        id: { in: uniqueCoopIds },
        deletedAt: null,
      },
      select: { id: true },
    });

    if (coops.length !== uniqueCoopIds.length) {
      throw new NotFoundException('One or more coop ids are not found');
    }
  }

  private async getUserById(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        username: true,
        role: true,
        isActive: true,
        createdAt: true,
        coopAccesses: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'asc' },
          select: {
            coopId: true,
            ownershipSharePercent: true,
            coop: { select: { name: true } },
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return {
      id: user.id,
      name: user.name,
      username: user.username,
      role: user.role,
      isActive: user.isActive,
      createdAt: user.createdAt,
      coopAccesses: user.coopAccesses.map((access) => ({
        coopId: access.coopId,
        coopName: access.coop.name,
        ownershipSharePercent: access.ownershipSharePercent
          ? access.ownershipSharePercent.toString()
          : null,
      })),
    };
  }
}
