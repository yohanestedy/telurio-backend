import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma';
import {
  ConflictException,
  NotFoundException,
  generateUuidV7,
} from '../common';
import { CreateEggPriceDto, QueryEggPricesDto, UpdateEggPriceDto } from './dto';

interface AuthUser {
  id: string;
}

@Injectable()
export class EggPricesService {
  constructor(private prisma: PrismaService) {}

  async getCurrentPrice() {
    const today = new Date();

    const current =
      (await this.prisma.eggPrice.findFirst({
        where: {
          deletedAt: null,
          effectiveDate: { lte: today },
        },
        orderBy: { effectiveDate: 'desc' },
      })) ??
      (await this.prisma.eggPrice.findFirst({
        where: { deletedAt: null },
        orderBy: { effectiveDate: 'desc' },
      }));

    if (!current) {
      throw new NotFoundException('No active egg price found');
    }

    return this.attachUpdatedByName(current);
  }

  async listPrices(query: QueryEggPricesDto) {
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
        skip: query.skip,
        take: query.limit,
        orderBy: { effectiveDate: 'desc' },
      }),
    ]);

    const data = await Promise.all(
      rows.map((row) => this.attachUpdatedByName(row)),
    );

    return {
      data,
      meta: {
        total,
        page: query.page,
        limit: query.limit,
      },
    };
  }

  async createPrice(actor: AuthUser, dto: CreateEggPriceDto) {
    const existing = await this.prisma.eggPrice.findFirst({
      where: {
        effectiveDate: new Date(dto.effectiveDate),
      },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException('Price for effective date already exists');
    }

    const created = await this.prisma.eggPrice.create({
      data: {
        id: generateUuidV7(),
        effectiveDate: new Date(dto.effectiveDate),
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
