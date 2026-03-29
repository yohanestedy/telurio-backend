import { Injectable } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  generateUuidV7,
} from '../common';
import {
  CreateProductionDto,
  DeleteProductionDto,
  QueryProductionsDto,
  UpdateProductionDto,
} from './dto';

interface AuthUser {
  id: string;
  role: Role;
}

@Injectable()
export class ProductionsService {
  constructor(private prisma: PrismaService) {}

  async listProductions(user: AuthUser, query: QueryProductionsDto) {
    const allowedCoopIds = await this.getAllowedCoopIds(user);

    if (
      query.coopId &&
      user.role !== Role.ADMIN &&
      !allowedCoopIds.includes(query.coopId)
    ) {
      throw new ForbiddenException('Coop is outside your scope');
    }

    const where: Prisma.ProductionRecordWhereInput = {
      deletedAt: null,
      ...(query.coopId ? { coopId: query.coopId } : {}),
      ...(query.date
        ? { date: new Date(query.date) }
        : query.startDate || query.endDate
          ? {
              date: {
                ...(query.startDate ? { gte: new Date(query.startDate) } : {}),
                ...(query.endDate ? { lte: new Date(query.endDate) } : {}),
              },
            }
          : {}),
      ...(user.role === Role.ADMIN
        ? {}
        : {
            coopId: { in: allowedCoopIds },
          }),
    };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.productionRecord.count({ where }),
      this.prisma.productionRecord.findMany({
        where,
        skip: query.skip,
        take: query.limit,
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        include: {
          coop: { select: { name: true } },
        },
      }),
    ]);

    const creatorIds = [...new Set(rows.map((row) => row.createdById))];
    const users = await this.prisma.user.findMany({
      where: { id: { in: creatorIds } },
      select: { id: true, name: true },
    });
    const userMap = new Map(users.map((u) => [u.id, u.name]));

    return {
      data: rows.map((row) => ({
        id: row.id,
        date: row.date,
        coopId: row.coopId,
        coopName: row.coop.name,
        collectionTime: row.collectionTime,
        goodKg: row.goodKg.toString(),
        goodCount: row.goodCount,
        brokenCount: row.brokenCount,
        notes: row.notes,
        createdByName: userMap.get(row.createdById) ?? null,
        createdAt: row.createdAt,
      })),
      meta: {
        total,
        page: query.page,
        limit: query.limit,
      },
    };
  }

  async createProduction(user: AuthUser, dto: CreateProductionDto) {
    if (user.role !== Role.ADMIN && user.role !== Role.OPERATOR) {
      throw new ForbiddenException(
        'Only ADMIN or OPERATOR can create production',
      );
    }

    const allowedCoopIds = await this.getAllowedCoopIds(user);
    if (user.role !== Role.ADMIN && !allowedCoopIds.includes(dto.coopId)) {
      throw new ForbiddenException('Coop is outside your scope');
    }

    const coop = await this.prisma.coop.findFirst({
      where: { id: dto.coopId, deletedAt: null },
      select: { id: true },
    });

    if (!coop) {
      throw new NotFoundException('Coop not found');
    }

    const duplicate = await this.prisma.productionRecord.findFirst({
      where: {
        date: new Date(dto.date),
        coopId: dto.coopId,
        collectionTime: dto.collectionTime,
        deletedAt: null,
      },
      select: { id: true },
    });

    if (duplicate) {
      throw new ConflictException(
        'Duplicate production collection time for this date and coop',
      );
    }

    const created = await this.prisma.productionRecord.create({
      data: {
        id: generateUuidV7(),
        date: new Date(dto.date),
        coopId: dto.coopId,
        collectionTime: dto.collectionTime,
        goodKg: dto.goodKg,
        goodCount: dto.goodCount,
        brokenCount: dto.brokenCount ?? null,
        notes: dto.notes ?? null,
        createdById: user.id,
      },
      include: {
        coop: { select: { name: true } },
      },
    });

    return {
      id: created.id,
      date: created.date,
      coopId: created.coopId,
      coopName: created.coop.name,
      collectionTime: created.collectionTime,
      goodKg: created.goodKg.toString(),
      goodCount: created.goodCount,
      brokenCount: created.brokenCount,
      notes: created.notes,
      createdByName: null,
      createdAt: created.createdAt,
    };
  }

  async updateProduction(id: string, user: AuthUser, dto: UpdateProductionDto) {
    const existing = await this.prisma.productionRecord.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });

    if (!existing) {
      throw new NotFoundException('Production record not found');
    }

    const updated = await this.prisma.productionRecord.update({
      where: { id },
      data: {
        ...(dto.goodKg !== undefined ? { goodKg: dto.goodKg } : {}),
        ...(dto.goodCount !== undefined ? { goodCount: dto.goodCount } : {}),
        ...(dto.brokenCount !== undefined
          ? { brokenCount: dto.brokenCount }
          : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
        updatedById: user.id,
        updatedAt: new Date(),
      },
      include: {
        coop: { select: { name: true } },
      },
    });

    return {
      id: updated.id,
      date: updated.date,
      coopId: updated.coopId,
      coopName: updated.coop.name,
      collectionTime: updated.collectionTime,
      goodKg: updated.goodKg.toString(),
      goodCount: updated.goodCount,
      brokenCount: updated.brokenCount,
      notes: updated.notes,
      createdAt: updated.createdAt,
    };
  }

  async deleteProduction(id: string, user: AuthUser, dto: DeleteProductionDto) {
    const existing = await this.prisma.productionRecord.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });

    if (!existing) {
      throw new NotFoundException('Production record not found');
    }

    await this.prisma.productionRecord.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        deletedById: user.id,
        deleteReason: dto.deleteReason,
        updatedById: user.id,
        updatedAt: new Date(),
      },
    });

    return { message: 'Record deleted successfully' };
  }

  private async getAllowedCoopIds(user: AuthUser): Promise<string[]> {
    if (user.role === Role.ADMIN) {
      const allCoops = await this.prisma.coop.findMany({
        where: { deletedAt: null },
        select: { id: true },
      });
      return allCoops.map((coop) => coop.id);
    }

    const accesses = await this.prisma.userCoopAccess.findMany({
      where: {
        userId: user.id,
        deletedAt: null,
        coop: { deletedAt: null },
      },
      select: { coopId: true },
    });

    return accesses.map((item) => item.coopId);
  }
}
