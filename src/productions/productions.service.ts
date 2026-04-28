import { Injectable } from '@nestjs/common';
import dayjs from 'dayjs';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma';
import { StocksService } from '../stocks';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  buildPaginationMeta,
  getTodayDateOnlyUtc,
  generateUuidV7,
  parseDateOnlyUtc,
  toDateKey,
} from '../common';
import {
  CreateProductionDto,
  DeleteProductionDto,
  QueryProductionAnalyticsDto,
  ProductionAnalyticsPeriod,
  QueryProductionsDto,
  UpdateProductionDto,
} from './dto';

interface AuthUser {
  id: string;
  role: Role;
}

@Injectable()
export class ProductionsService {
  constructor(
    private prisma: PrismaService,
    private stocksService: StocksService,
  ) {}

  async listProductions(user: AuthUser, query: QueryProductionsDto) {
    const orderByMap: Record<
      string,
      Prisma.ProductionRecordOrderByWithRelationInput
    > = {
      date: { date: query.order },
      createdAt: { createdAt: query.order },
      goodKg: { goodKg: query.order },
      goodCount: { goodCount: query.order },
    };

    const allowedCoopIds = await this.getAllowedCoopIds(user);

    if (
      query.coopId &&
      user.role !== Role.ADMIN &&
      !allowedCoopIds.includes(query.coopId)
    ) {
      throw new ForbiddenException('Coop is outside your scope');
    }

    const coopFilter: Prisma.ProductionRecordWhereInput['coopId'] = query.coopId
      ? query.coopId
      : user.role === Role.ADMIN
        ? undefined
        : { in: allowedCoopIds };

    const where: Prisma.ProductionRecordWhereInput = {
      deletedAt: null,
      ...(coopFilter ? { coopId: coopFilter } : {}),
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
    };

    const orderBy: Prisma.ProductionRecordOrderByWithRelationInput[] =
      query.sortBy === 'createdAt'
        ? [orderByMap[query.sortBy]]
        : [orderByMap[query.sortBy], { createdAt: 'desc' }];

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.productionRecord.count({ where }),
      this.prisma.productionRecord.findMany({
        where,
        skip: query.offset,
        take: query.take,
        orderBy,
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
        populationSnapshot: row.populationSnapshot,
        notes: row.notes,
        createdByName: userMap.get(row.createdById) ?? null,
        createdAt: row.createdAt,
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
          coopId: query.coopId,
          date: query.date,
          startDate: query.startDate,
          endDate: query.endDate,
        },
      }),
    };
  }

  async getProductionAnalytics(
    user: AuthUser,
    query: QueryProductionAnalyticsDto,
  ) {
    const period = query.period ?? '1w';
    const days = this.getAnalyticsPeriodDays(period);
    const endDate = query.endDate
      ? parseDateOnlyUtc(query.endDate, 'endDate')
      : getTodayDateOnlyUtc();
    const startDate = dayjs(endDate)
      .subtract(days - 1, 'day')
      .toDate();
    const previousEndDate = dayjs(startDate).subtract(1, 'day').toDate();
    const previousStartDate = dayjs(previousEndDate)
      .subtract(days - 1, 'day')
      .toDate();

    const allowedCoopIds = await this.getAllowedCoopIds(user);
    if (
      query.coopId &&
      user.role !== Role.ADMIN &&
      !allowedCoopIds.includes(query.coopId)
    ) {
      throw new ForbiddenException('Coop is outside your scope');
    }

    const coopFilter: Prisma.ProductionRecordWhereInput['coopId'] =
      query.coopId
        ? query.coopId
        : user.role === Role.ADMIN
          ? undefined
          : { in: allowedCoopIds };

    const [currentRows, previousRows] = await Promise.all([
      this.getAnalyticsRows(startDate, endDate, coopFilter),
      this.getAnalyticsRows(previousStartDate, previousEndDate, coopFilter),
    ]);

    const series = this.buildAnalyticsSeries(startDate, days, currentRows);
    const previousSeries = this.buildAnalyticsSeries(
      previousStartDate,
      days,
      previousRows,
    );
    const summary = this.buildAnalyticsSummary(series);
    const previousSummary = this.buildAnalyticsSummary(previousSeries);

    return {
      period,
      coopId: query.coopId ?? null,
      startDate: toDateKey(startDate),
      endDate: toDateKey(endDate),
      previousStartDate: toDateKey(previousStartDate),
      previousEndDate: toDateKey(previousEndDate),
      summary,
      previousSummary,
      changes: {
        totalGoodCountPercent: this.percentChange(
          summary.totalGoodCount,
          previousSummary.totalGoodCount,
        ),
        averageDailyGoodCountPercent: this.percentChange(
          summary.averageDailyGoodCount,
          previousSummary.averageDailyGoodCount,
        ),
        averagePerformancePercent: this.percentChange(
          summary.averagePerformancePercent,
          previousSummary.averagePerformancePercent,
        ),
      },
      series,
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
      select: { id: true, population: true },
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

    const created = await this.prisma.$transaction(async (tx) => {
      const createdRecord = await tx.productionRecord.create({
        data: {
          id: generateUuidV7(),
          date: new Date(dto.date),
          coopId: dto.coopId,
          collectionTime: dto.collectionTime,
          goodKg: dto.goodKg,
          goodCount: dto.goodCount,
          brokenCount: dto.brokenCount ?? null,
          populationSnapshot: coop.population,
          notes: dto.notes ?? null,
          createdById: user.id,
        },
        include: {
          coop: { select: { name: true } },
        },
      });

      await this.stocksService.addProductionStock(tx, {
        coopId: createdRecord.coopId,
        movementDate: getTodayDateOnlyUtc(),
        quantityKg: Number(createdRecord.goodKg),
        sourceId: createdRecord.id,
        createdById: user.id,
      });

      return createdRecord;
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
      populationSnapshot: created.populationSnapshot,
      notes: created.notes,
      createdByName: null,
      createdAt: created.createdAt,
    };
  }

  async updateProduction(id: string, user: AuthUser, dto: UpdateProductionDto) {
    const existing = await this.prisma.productionRecord.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, coopId: true, goodKg: true },
    });

    if (!existing) {
      throw new NotFoundException('Production record not found');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const updatedRecord = await tx.productionRecord.update({
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

      await this.stocksService.reconcileProductionStock(tx, {
        coopId: existing.coopId,
        movementDate: getTodayDateOnlyUtc(),
        previousKg: Number(existing.goodKg),
        nextKg: Number(updatedRecord.goodKg),
        sourceId: existing.id,
        createdById: user.id,
      });

      return updatedRecord;
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
      populationSnapshot: updated.populationSnapshot,
      notes: updated.notes,
      createdAt: updated.createdAt,
    };
  }

  async deleteProduction(id: string, user: AuthUser, dto: DeleteProductionDto) {
    const existing = await this.prisma.productionRecord.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, coopId: true, goodKg: true },
    });

    if (!existing) {
      throw new NotFoundException('Production record not found');
    }

    await this.prisma.$transaction(async (tx) => {
      await this.stocksService.removeProductionStock(tx, {
        coopId: existing.coopId,
        movementDate: getTodayDateOnlyUtc(),
        quantityKg: Number(existing.goodKg),
        sourceId: existing.id,
        createdById: user.id,
      });

      await tx.productionRecord.update({
        where: { id },
        data: {
          deletedAt: new Date(),
          deletedById: user.id,
          deleteReason: dto.deleteReason,
          updatedById: user.id,
          updatedAt: new Date(),
        },
      });
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

  private getAnalyticsPeriodDays(period: ProductionAnalyticsPeriod) {
    return {
      '1w': 7,
      '1m': 30,
      '3m': 90,
      '6m': 180,
    }[period];
  }

  private async getAnalyticsRows(
    startDate: Date,
    endDate: Date,
    coopFilter: Prisma.ProductionRecordWhereInput['coopId'],
  ) {
    return await this.prisma.productionRecord.findMany({
      where: {
        deletedAt: null,
        ...(coopFilter ? { coopId: coopFilter } : {}),
        date: {
          gte: startDate,
          lte: endDate,
        },
      },
      select: {
        date: true,
        coopId: true,
        goodCount: true,
        populationSnapshot: true,
      },
      orderBy: {
        date: 'asc',
      },
    });
  }

  private buildAnalyticsSeries(
    startDate: Date,
    days: number,
    rows: Awaited<ReturnType<ProductionsService['getAnalyticsRows']>>,
  ) {
    const rowMap = new Map<
      string,
      {
        goodCount: number;
        populationByCoop: Map<string, number>;
      }
    >();

    for (const row of rows) {
      const key = toDateKey(row.date);
      const bucket =
        rowMap.get(key) ??
        {
          goodCount: 0,
          populationByCoop: new Map<string, number>(),
        };

      bucket.goodCount += row.goodCount;
      if (row.populationSnapshot !== null) {
        bucket.populationByCoop.set(row.coopId, row.populationSnapshot);
      }

      rowMap.set(key, bucket);
    }

    return Array.from({ length: days }, (_, index) => {
      const date = dayjs(startDate).add(index, 'day').toDate();
      const dateKey = toDateKey(date);
      const row = rowMap.get(dateKey);
      const hasProduction = Boolean(row);
      const goodCount = row?.goodCount ?? 0;
      const population = row?.populationByCoop.size
        ? [...row.populationByCoop.values()].reduce((sum, item) => sum + item, 0)
        : null;
      const performancePercent =
        population && population > 0
          ? Number(((goodCount / population) * 100).toFixed(1))
          : null;

      return {
        date: dateKey,
        hasProduction,
        goodCount,
        averagePopulation: population ? Math.round(population) : null,
        performancePercent,
      };
    });
  }

  private buildAnalyticsSummary(
    series: ReturnType<ProductionsService['buildAnalyticsSeries']>,
  ) {
    const totalGoodCount = series.reduce((sum, item) => sum + item.goodCount, 0);
    const populationItems = series.filter(
      (item) => item.averagePopulation !== null,
    );
    const performanceItems = series.filter(
      (item) => item.performancePercent !== null,
    );

    return {
      totalGoodCount,
      averageDailyGoodCount: Math.round(totalGoodCount / series.length),
      averagePerformancePercent: performanceItems.length
        ? Number(
            (
              performanceItems.reduce(
                (sum, item) => sum + (item.performancePercent ?? 0),
                0,
              ) / performanceItems.length
            ).toFixed(1),
          )
        : null,
      averagePopulation: populationItems.length
        ? Math.round(
            populationItems.reduce(
              (sum, item) => sum + (item.averagePopulation ?? 0),
              0,
            ) / populationItems.length,
          )
        : null,
    };
  }

  private percentChange(current: number | null, previous: number | null) {
    if (current === null || previous === null || previous === 0) {
      return null;
    }

    return Number((((current - previous) / previous) * 100).toFixed(1));
  }
}
