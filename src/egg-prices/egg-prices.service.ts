import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma';
import {
  buildPaginationMeta,
  ConflictException,
  getTodayDateOnlyUtc,
  NotFoundException,
  generateUuidV7,
  parseDateOnlyUtc,
} from '../common';
import { CreateEggPriceDto, QueryEggPricesDto, UpdateEggPriceDto } from './dto';

interface AuthUser {
  id: string;
}

@Injectable()
export class EggPricesService {
  constructor(private prisma: PrismaService) {}

  async getCurrentPrice() {
    const today = getTodayDateOnlyUtc();
    const current = await this.prisma.eggPrice.findFirst({
      where: {
        deletedAt: null,
        effectiveDate: today,
      },
    });

    if (!current) {
      throw new NotFoundException('No egg price found for today');
    }

    return this.attachUpdatedByName(current);
  }

  async listPrices(query: QueryEggPricesDto) {
    const orderByMap: Record<string, Prisma.EggPriceOrderByWithRelationInput> =
      {
        effectiveDate: { effectiveDate: query.order },
        createdAt: { createdAt: query.order },
        pricePerKg: { pricePerKg: query.order },
      };

    const where: Prisma.EggPriceWhereInput = {
      deletedAt: null,
      ...(query.startDate || query.endDate
        ? {
            effectiveDate: {
              ...(query.startDate ? { gte: new Date(query.startDate) } : {}),
              ...(query.endDate ? { lte: new Date(query.endDate) } : {}),
            },
          }
        : {}),
    };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.eggPrice.count({ where }),
      this.prisma.eggPrice.findMany({
        where,
        skip: query.offset,
        take: query.take,
        orderBy: orderByMap[query.sortBy],
      }),
    ]);

    const data = await Promise.all(
      rows.map((row) => this.attachUpdatedByName(row)),
    );

    return {
      data,
      meta: buildPaginationMeta({
        page: query.page,
        limit: query.limit,
        total,
        sortBy: query.sortBy,
        order: query.order,
        all: query.all,
        filters: {
          all: query.all,
          startDate: query.startDate,
          endDate: query.endDate,
        },
      }),
    };
  }

  async createPrice(actor: AuthUser, dto: CreateEggPriceDto) {
    const effectiveDate = parseDateOnlyUtc(dto.effectiveDate, 'effectiveDate');

    const existing = await this.prisma.eggPrice.findFirst({
      where: {
        effectiveDate,
      },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException('Price for effective date already exists');
    }

    const created = await this.prisma.eggPrice.create({
      data: {
        id: generateUuidV7(),
        effectiveDate,
        pricePerKg: BigInt(dto.pricePerKg),
        notes: dto.notes ?? null,
        createdById: actor.id,
        updatedById: actor.id,
      },
    });

    return this.attachUpdatedByName(created);
  }

  async updatePrice(id: string, actor: AuthUser, dto: UpdateEggPriceDto) {
    const existing = await this.prisma.eggPrice.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      select: { id: true },
    });

    if (!existing) {
      throw new NotFoundException('Egg price not found');
    }

    const updated = await this.prisma.eggPrice.update({
      where: { id },
      data: {
        ...(dto.pricePerKg !== undefined
          ? { pricePerKg: BigInt(dto.pricePerKg) }
          : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
        updatedById: actor.id,
        updatedAt: new Date(),
      },
    });

    return this.attachUpdatedByName(updated);
  }

  private async attachUpdatedByName(row: {
    id: string;
    effectiveDate: Date;
    pricePerKg: bigint;
    notes: string | null;
    updatedById: string | null;
  }) {
    let updatedByName: string | null = null;

    if (row.updatedById) {
      const user = await this.prisma.user.findUnique({
        where: { id: row.updatedById },
        select: { name: true },
      });
      updatedByName = user?.name ?? null;
    }

    return {
      id: row.id,
      effectiveDate: row.effectiveDate,
      pricePerKg: row.pricePerKg,
      notes: row.notes,
      updatedByName,
    };
  }
}
