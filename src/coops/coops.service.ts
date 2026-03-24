import { Injectable } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma';
import { generateUuidV7 } from '../common';
import { ConflictException, NotFoundException } from '../common';
import { CreateCoopDto, QueryCoopsDto, UpdateCoopDto } from './dto';

interface AuthUserContext {
  id: string;
  role: Role;
}

@Injectable()
export class CoopsService {
  constructor(private prisma: PrismaService) {}

  async listCoops(user: AuthUserContext, query: QueryCoopsDto) {
    const where: Prisma.CoopWhereInput = {
      deletedAt: null,
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(user.role === Role.ADMIN
        ? {}
        : {
            userAccesses: {
              some: {
                userId: user.id,
                deletedAt: null,
              },
            },
          }),
    };

    const [total, coops] = await this.prisma.$transaction([
      this.prisma.coop.count({ where }),
      this.prisma.coop.findMany({
        where,
        skip: query.skip,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          population: true,
          chickenStrain: true,
          chickBirthDate: true,
          depreciationPercent: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
    ]);

    return {
      data: coops.map((coop) => ({
        ...coop,
        depreciationPercent: coop.depreciationPercent.toString(),
      })),
      meta: {
        total,
        page: query.page,
        limit: query.limit,
      },
    };
  }

  async createCoop(actor: AuthUserContext, dto: CreateCoopDto) {
    const existing = await this.prisma.coop.findUnique({
      where: { name: dto.name },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException('Coop name already exists');
    }

    const created = await this.prisma.coop.create({
      data: {
        id: generateUuidV7(),
        name: dto.name,
        population: dto.population,
        chickenStrain: dto.chickenStrain ?? null,
        chickBirthDate: dto.chickBirthDate
          ? new Date(dto.chickBirthDate)
          : null,
        depreciationPercent: dto.depreciationPercent ?? 15,
        createdById: actor.id,
        updatedById: actor.id,
      },
      select: {
        id: true,
        name: true,
        population: true,
        chickenStrain: true,
        chickBirthDate: true,
        depreciationPercent: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return {
      ...created,
      depreciationPercent: created.depreciationPercent.toString(),
    };
  }

  async updateCoop(coopId: string, actor: AuthUserContext, dto: UpdateCoopDto) {
    const existing = await this.prisma.coop.findFirst({
      where: {
        id: coopId,
        deletedAt: null,
      },
      select: { id: true },
    });

    if (!existing) {
      throw new NotFoundException('Coop not found');
    }

    if (dto.name) {
      const nameConflict = await this.prisma.coop.findFirst({
        where: {
          name: dto.name,
          NOT: { id: coopId },
        },
        select: { id: true },
      });

      if (nameConflict) {
        throw new ConflictException('Coop name already exists');
      }
    }

    const now = new Date();
    const data: Prisma.CoopUpdateInput = {
      updatedById: actor.id,
    };

    if (dto.name !== undefined) {
      data.name = dto.name;
    }
    if (dto.population !== undefined) {
      data.population = dto.population;
    }
    if (dto.chickenStrain !== undefined) {
      data.chickenStrain = dto.chickenStrain;
    }
    if (dto.chickBirthDate !== undefined) {
      data.chickBirthDate = dto.chickBirthDate
        ? new Date(dto.chickBirthDate)
        : null;
    }
    if (dto.depreciationPercent !== undefined) {
      data.depreciationPercent = dto.depreciationPercent;
    }
    if (dto.isActive !== undefined) {
      data.isActive = dto.isActive;
    }

    if (dto.deleteReason !== undefined) {
      data.deletedAt = now;
      data.deletedById = actor.id;
      data.deleteReason = dto.deleteReason;
      data.isActive = false;
    }

    const updated = await this.prisma.coop.update({
      where: { id: coopId },
      data,
      select: {
        id: true,
        name: true,
        population: true,
        chickenStrain: true,
        chickBirthDate: true,
        depreciationPercent: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return {
      ...updated,
      depreciationPercent: updated.depreciationPercent.toString(),
    };
  }
}
