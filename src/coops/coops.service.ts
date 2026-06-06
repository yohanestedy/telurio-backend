import { Injectable } from '@nestjs/common';
import { CoopPopulationChangeType, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma';
import {
  buildPaginationMeta,
  ConflictException,
  generateUuidV7,
  getTodayDateOnlyUtc,
  NotFoundException,
  parseDateOnlyUtc,
} from '../common';
import {
  CreateCoopDto,
  QueryCoopPopulationHistoryDto,
  QueryCoopsDto,
  UpdateCoopDto,
} from './dto';

interface AuthUserContext {
  id: string;
  role: Role;
}

@Injectable()
export class CoopsService {
  constructor(private prisma: PrismaService) {}

  async listCoops(user: AuthUserContext, query: QueryCoopsDto) {
    const orderByMap: Record<string, Prisma.CoopOrderByWithRelationInput> = {
      createdAt: { createdAt: query.order },
      updatedAt: { updatedAt: query.order },
      name: { name: query.order },
      population: { population: query.order },
    };

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
        skip: query.offset,
        take: query.take,
        orderBy: orderByMap[query.sortBy],
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
      meta: buildPaginationMeta({
        page: query.page,
        limit: query.limit,
        total,
        sortBy: query.sortBy,
        order: query.order,
        all: query.all,
        filters: {
          all: query.all,
          isActive: query.isActive,
        },
      }),
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

    let created: Prisma.CoopGetPayload<{
      select: {
        id: true;
        name: true;
        population: true;
        chickenStrain: true;
        chickBirthDate: true;
        depreciationPercent: true;
        isActive: true;
        createdAt: true;
        updatedAt: true;
      };
    }>;

    try {
      created = await this.prisma.$transaction(async (tx) => {
        const createdCoop = await tx.coop.create({
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

        await tx.coopPopulationHistory.create({
          data: {
            id: generateUuidV7(),
            coopId: createdCoop.id,
            effectiveDate: getTodayDateOnlyUtc(),
            previousPopulation: null,
            newPopulation: createdCoop.population,
            deltaPopulation: createdCoop.population,
            changeType: CoopPopulationChangeType.INITIAL,
            reason: dto.populationChangeReason ?? null,
            createdById: actor.id,
          },
        });

        return createdCoop;
      });
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException('Coop name already exists');
      }
      throw error;
    }

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
      select: { id: true, population: true },
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
      updatedAt: now,
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

    const populationChanged =
      dto.population !== undefined && dto.population !== existing.population;
    const populationEffectiveDate = populationChanged
      ? dto.populationEffectiveDate
        ? parseDateOnlyUtc(
            dto.populationEffectiveDate,
            'populationEffectiveDate',
          )
        : getTodayDateOnlyUtc()
      : null;

    const updated = await this.prisma.$transaction(async (tx) => {
      const updatedCoop = await tx.coop.update({
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

      if (populationChanged) {
        await tx.coopPopulationHistory.create({
          data: {
            id: generateUuidV7(),
            coopId,
            effectiveDate: populationEffectiveDate!,
            previousPopulation: existing.population,
            newPopulation: dto.population!,
            deltaPopulation: dto.population! - existing.population,
            changeType: CoopPopulationChangeType.ADJUSTMENT,
            reason: dto.populationChangeReason ?? null,
            createdById: actor.id,
          },
        });
      }

      return updatedCoop;
    });

    return {
      ...updated,
      depreciationPercent: updated.depreciationPercent.toString(),
    };
  }

  async getPopulationHistories(
    coopId: string,
    user: AuthUserContext,
    query: QueryCoopPopulationHistoryDto,
  ) {
    const coop = await this.prisma.coop.findFirst({
      where: {
        id: coopId,
        deletedAt: null,
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
      },
      select: {
        id: true,
        name: true,
        population: true,
      },
    });

    if (!coop) {
      throw new NotFoundException('Coop not found');
    }

    const histories = await this.prisma.coopPopulationHistory.findMany({
      where: { coopId },
      orderBy: [
        { effectiveDate: 'desc' },
        { createdAt: 'desc' },
      ],
      take: query.limit,
      select: {
        id: true,
        effectiveDate: true,
        previousPopulation: true,
        newPopulation: true,
        deltaPopulation: true,
        changeType: true,
        reason: true,
        createdAt: true,
      },
    });

    const initialPopulation =
      histories.length > 0
        ? histories[histories.length - 1]!.newPopulation
        : coop.population;
    const totalDelta = coop.population - initialPopulation;
    const latestChange = histories[0]?.deltaPopulation ?? 0;

    return {
      coopId: coop.id,
      coopName: coop.name,
      currentPopulation: coop.population,
      initialPopulation,
      totalDelta,
      latestChange,
      items: histories,
    };
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }
}
