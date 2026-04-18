import { Injectable } from '@nestjs/common';
import {
  Prisma,
  Role,
  StockMovementDirection,
  StockMovementSource,
  StockMovementType,
} from '@prisma/client';
import {
  BusinessRuleException,
  generateUuidV7,
  getTodayDateOnlyUtc,
} from '../common';
import { PrismaService } from '../prisma';

interface AuthUser {
  id: string;
  role: Role;
}

export interface LiveStockCoopItem {
  coopId: string;
  coopName: string;
  availableKg: string;
  todayInKg: string;
  todayOutKg: string;
  updatedAt: Date | null;
}

export interface LiveStockResponse {
  asOfDate: Date;
  combinedAvailableKg: string;
  combinedTodayInKg: string;
  combinedTodayOutKg: string;
  coops: LiveStockCoopItem[];
}

interface StockAllocationInput {
  sourceId: string;
  coopId: string;
  quantityKg: number;
}

@Injectable()
export class StocksService {
  constructor(private prisma: PrismaService) {}

  async getLiveStock(user: AuthUser): Promise<LiveStockResponse> {
    const allowedCoopIds = await this.getAllowedCoopIds(user);
    const todayDate = getTodayDateOnlyUtc();

    if (!allowedCoopIds.length) {
      return {
        asOfDate: todayDate,
        combinedAvailableKg: this.formatKg(0),
        combinedTodayInKg: this.formatKg(0),
        combinedTodayOutKg: this.formatKg(0),
        coops: [] as LiveStockCoopItem[],
      };
    }

    const [coops, groupedMovements] = await this.prisma.$transaction([
      this.prisma.coop.findMany({
        where: {
          id: { in: allowedCoopIds },
          deletedAt: null,
        },
        select: {
          id: true,
          name: true,
          stockBalance: {
            select: {
              availableKg: true,
              updatedAt: true,
            },
          },
        },
        orderBy: { name: 'asc' },
      }),
      this.prisma.stockMovement.groupBy({
        by: ['coopId', 'direction'],
        orderBy: [{ coopId: 'asc' }, { direction: 'asc' }],
        where: {
          coopId: { in: allowedCoopIds },
          movementDate: todayDate,
        },
        _sum: {
          quantityKg: true,
        },
      }),
    ]);

    const movementMap = new Map<string, { inKg: number; outKg: number }>();

    for (const item of groupedMovements) {
      const current = movementMap.get(item.coopId) ?? { inKg: 0, outKg: 0 };
      const quantity = this.toKg(item._sum?.quantityKg);

      if (item.direction === StockMovementDirection.IN) {
        current.inKg = this.normalizeKg(current.inKg + quantity);
      }

      if (item.direction === StockMovementDirection.OUT) {
        current.outKg = this.normalizeKg(current.outKg + quantity);
      }

      movementMap.set(item.coopId, current);
    }

    const coopRows: LiveStockCoopItem[] = coops.map((coop) => {
      const movement = movementMap.get(coop.id) ?? { inKg: 0, outKg: 0 };
      const availableKg = this.toKg(coop.stockBalance?.availableKg);

      return {
        coopId: coop.id,
        coopName: coop.name,
        availableKg: this.formatKg(availableKg),
        todayInKg: this.formatKg(movement.inKg),
        todayOutKg: this.formatKg(movement.outKg),
        updatedAt: coop.stockBalance?.updatedAt ?? null,
      };
    });

    const combinedAvailableKg = this.normalizeKg(
      coopRows.reduce((sum, item) => sum + Number(item.availableKg), 0),
    );
    const combinedTodayInKg = this.normalizeKg(
      coopRows.reduce((sum, item) => sum + Number(item.todayInKg), 0),
    );
    const combinedTodayOutKg = this.normalizeKg(
      coopRows.reduce((sum, item) => sum + Number(item.todayOutKg), 0),
    );

    return {
      asOfDate: todayDate,
      combinedAvailableKg: this.formatKg(combinedAvailableKg),
      combinedTodayInKg: this.formatKg(combinedTodayInKg),
      combinedTodayOutKg: this.formatKg(combinedTodayOutKg),
      coops: coopRows,
    };
  }

  async addProductionStock(
    tx: Prisma.TransactionClient,
    params: {
      coopId: string;
      movementDate: Date;
      quantityKg: number;
      sourceId: string;
      createdById: string;
    },
  ) {
    const quantityKg = this.normalizeKg(params.quantityKg);
    if (quantityKg <= 0) {
      return;
    }

    await tx.coopStockBalance.upsert({
      where: { coopId: params.coopId },
      create: {
        coopId: params.coopId,
        availableKg: quantityKg,
      },
      update: {
        availableKg: { increment: quantityKg },
      },
    });

    await this.createMovement(tx, {
      coopId: params.coopId,
      movementDate: params.movementDate,
      movementType: StockMovementType.PRODUCTION_IN,
      direction: StockMovementDirection.IN,
      sourceType: StockMovementSource.PRODUCTION_RECORD,
      sourceId: params.sourceId,
      quantityKg,
      createdById: params.createdById,
      notes: 'Incoming stock from production input',
    });
  }

  async reconcileProductionStock(
    tx: Prisma.TransactionClient,
    params: {
      coopId: string;
      movementDate: Date;
      previousKg: number;
      nextKg: number;
      sourceId: string;
      createdById: string;
    },
  ) {
    const previousKg = this.normalizeKg(params.previousKg);
    const nextKg = this.normalizeKg(params.nextKg);
    const delta = this.normalizeKg(nextKg - previousKg);

    if (delta === 0) {
      return;
    }

    if (delta > 0) {
      await tx.coopStockBalance.upsert({
        where: { coopId: params.coopId },
        create: {
          coopId: params.coopId,
          availableKg: delta,
        },
        update: {
          availableKg: { increment: delta },
        },
      });

      await this.createMovement(tx, {
        coopId: params.coopId,
        movementDate: params.movementDate,
        movementType: StockMovementType.PRODUCTION_CORRECTION_IN,
        direction: StockMovementDirection.IN,
        sourceType: StockMovementSource.PRODUCTION_RECORD,
        sourceId: params.sourceId,
        quantityKg: delta,
        createdById: params.createdById,
        notes: 'Production correction increased stock',
      });
      return;
    }

    const outgoingKg = Math.abs(delta);
    await this.consumeStock(
      tx,
      params.coopId,
      outgoingKg,
      'Stok tidak cukup untuk mengurangi nilai produksi',
    );

    await this.createMovement(tx, {
      coopId: params.coopId,
      movementDate: params.movementDate,
      movementType: StockMovementType.PRODUCTION_CORRECTION_OUT,
      direction: StockMovementDirection.OUT,
      sourceType: StockMovementSource.PRODUCTION_RECORD,
      sourceId: params.sourceId,
      quantityKg: outgoingKg,
      createdById: params.createdById,
      notes: 'Production correction decreased stock',
    });
  }

  async removeProductionStock(
    tx: Prisma.TransactionClient,
    params: {
      coopId: string;
      movementDate: Date;
      quantityKg: number;
      sourceId: string;
      createdById: string;
    },
  ) {
    const quantityKg = this.normalizeKg(params.quantityKg);
    if (quantityKg <= 0) {
      return;
    }

    await this.consumeStock(
      tx,
      params.coopId,
      quantityKg,
      'Stok tidak cukup untuk menghapus data produksi',
    );

    await this.createMovement(tx, {
      coopId: params.coopId,
      movementDate: params.movementDate,
      movementType: StockMovementType.PRODUCTION_CORRECTION_OUT,
      direction: StockMovementDirection.OUT,
      sourceType: StockMovementSource.PRODUCTION_RECORD,
      sourceId: params.sourceId,
      quantityKg,
      createdById: params.createdById,
      notes: 'Production record deleted',
    });
  }

  async reserveForOrderAllocations(
    tx: Prisma.TransactionClient,
    params: {
      orderId: string;
      movementDate: Date;
      createdById: string;
      allocations: StockAllocationInput[];
    },
  ) {
    for (const allocation of params.allocations) {
      const quantityKg = this.normalizeKg(allocation.quantityKg);
      if (quantityKg <= 0) {
        continue;
      }

      await this.consumeStock(
        tx,
        allocation.coopId,
        quantityKg,
        'Stok kandang tidak cukup untuk alokasi pengantaran',
      );

      await this.createMovement(tx, {
        coopId: allocation.coopId,
        movementDate: params.movementDate,
        movementType: StockMovementType.ALLOCATION_OUT,
        direction: StockMovementDirection.OUT,
        sourceType: StockMovementSource.ORDER_ALLOCATION,
        sourceId: allocation.sourceId,
        orderId: params.orderId,
        quantityKg,
        createdById: params.createdById,
        notes: 'Outgoing stock from order allocation',
      });
    }
  }

  async reconcileOrderAllocations(
    tx: Prisma.TransactionClient,
    params: {
      orderId: string;
      movementDate: Date;
      createdById: string;
      previousAllocations: Array<{
        id: string;
        coopId: string;
        quantityKg: Prisma.Decimal;
      }>;
      nextAllocations: Array<{
        id: string;
        coopId: string;
        quantityKg: number;
      }>;
    },
  ) {
    const previousByCoop = this.groupAllocationsByCoop(
      params.previousAllocations.map((item) => ({
        coopId: item.coopId,
        quantityKg: this.toKg(item.quantityKg),
      })),
    );
    const nextByCoop = this.groupAllocationsByCoop(
      params.nextAllocations.map((item) => ({
        coopId: item.coopId,
        quantityKg: item.quantityKg,
      })),
    );

    const allCoopIds = new Set([
      ...previousByCoop.keys(),
      ...nextByCoop.keys(),
    ]);

    for (const coopId of allCoopIds) {
      const prev = previousByCoop.get(coopId) ?? 0;
      const next = nextByCoop.get(coopId) ?? 0;
      const delta = this.normalizeKg(next - prev);

      if (delta === 0) {
        continue;
      }

      if (delta > 0) {
        await this.consumeStock(
          tx,
          coopId,
          delta,
          'Stok kandang tidak cukup untuk perubahan alokasi',
        );

        await this.createMovement(tx, {
          coopId,
          movementDate: params.movementDate,
          movementType: StockMovementType.ALLOCATION_OUT,
          direction: StockMovementDirection.OUT,
          sourceType: StockMovementSource.ORDER_ALLOCATION,
          sourceId: `${params.orderId}:${coopId}:delta-out:${generateUuidV7()}`,
          orderId: params.orderId,
          quantityKg: delta,
          createdById: params.createdById,
          notes: 'Outgoing stock from allocation adjustment',
        });
        continue;
      }

      const releaseKg = Math.abs(delta);
      await tx.coopStockBalance.upsert({
        where: { coopId },
        create: {
          coopId,
          availableKg: releaseKg,
        },
        update: {
          availableKg: { increment: releaseKg },
        },
      });

      await this.createMovement(tx, {
        coopId,
        movementDate: params.movementDate,
        movementType: StockMovementType.ALLOCATION_RELEASE,
        direction: StockMovementDirection.IN,
        sourceType: StockMovementSource.ORDER_ALLOCATION,
        sourceId: `${params.orderId}:${coopId}:release:${generateUuidV7()}`,
        orderId: params.orderId,
        quantityKg: releaseKg,
        createdById: params.createdById,
        notes: 'Stock returned from allocation adjustment',
      });
    }
  }

  private groupAllocationsByCoop(
    allocations: Array<{ coopId: string; quantityKg: number }>,
  ) {
    const byCoop = new Map<string, number>();

    for (const item of allocations) {
      const current = byCoop.get(item.coopId) ?? 0;
      byCoop.set(
        item.coopId,
        this.normalizeKg(current + this.normalizeKg(item.quantityKg)),
      );
    }

    return byCoop;
  }

  private async consumeStock(
    tx: Prisma.TransactionClient,
    coopId: string,
    quantityKg: number,
    insufficientMessage: string,
  ) {
    const normalized = this.normalizeKg(quantityKg);

    await tx.coopStockBalance.upsert({
      where: { coopId },
      create: {
        coopId,
        availableKg: 0,
      },
      update: {},
    });

    const updated = await tx.coopStockBalance.updateMany({
      where: {
        coopId,
        availableKg: {
          gte: normalized,
        },
      },
      data: {
        availableKg: { decrement: normalized },
      },
    });

    if (updated.count === 1) {
      return;
    }

    const balance = await tx.coopStockBalance.findUnique({
      where: { coopId },
      include: {
        coop: {
          select: { name: true },
        },
      },
    });

    const availableKg = this.toKg(balance?.availableKg);
    const coopName = balance?.coop.name ?? coopId;

    throw new BusinessRuleException(
      `${insufficientMessage}. Kandang ${coopName}: tersedia ${this.formatKg(availableKg)} kg, diminta ${this.formatKg(normalized)} kg`,
    );
  }

  private async createMovement(
    tx: Prisma.TransactionClient,
    params: {
      coopId: string;
      movementDate: Date;
      movementType: StockMovementType;
      direction: StockMovementDirection;
      sourceType: StockMovementSource;
      sourceId: string;
      quantityKg: number;
      createdById: string;
      orderId?: string;
      notes?: string;
    },
  ) {
    await tx.stockMovement.create({
      data: {
        id: generateUuidV7(),
        coopId: params.coopId,
        movementDate: params.movementDate,
        movementType: params.movementType,
        direction: params.direction,
        sourceType: params.sourceType,
        sourceId: params.sourceId,
        orderId: params.orderId,
        quantityKg: this.normalizeKg(params.quantityKg),
        createdById: params.createdById,
        notes: params.notes ?? null,
      },
    });
  }

  private async getAllowedCoopIds(user: AuthUser): Promise<string[]> {
    if (user.role === Role.ADMIN) {
      const coops = await this.prisma.coop.findMany({
        where: { deletedAt: null },
        select: { id: true },
      });
      return coops.map((item) => item.id);
    }

    const accesses = await this.prisma.userCoopAccess.findMany({
      where: {
        userId: user.id,
        deletedAt: null,
        coop: {
          deletedAt: null,
        },
      },
      select: {
        coopId: true,
      },
    });

    return accesses.map((item) => item.coopId);
  }

  private toKg(value: Prisma.Decimal | number | string | null | undefined) {
    if (value === null || value === undefined) {
      return 0;
    }

    return this.normalizeKg(Number(value));
  }

  private normalizeKg(value: number) {
    return Number(value.toFixed(3));
  }

  private formatKg(value: number) {
    return this.normalizeKg(value).toFixed(3);
  }
}
