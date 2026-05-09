import { Injectable } from '@nestjs/common';
import {
  DeliveryStatus,
  OrderLifecycleStatus,
  OrderPriceSource,
  Role,
} from '@prisma/client';
import { PrismaService } from '../prisma';
import {
  BusinessRuleException,
  ForbiddenException,
  NotFoundException,
  getTodayDateKey,
  getTodayDateOnlyUtc,
  toDateKey,
  generateUuidV7,
} from '../common';
import { OrdersService } from '../orders';
import { StocksService } from '../stocks';
import { StartDeliveryDto, UpdateAllocationsDto } from './dto';

interface AuthUser {
  id: string;
  role: Role;
}

@Injectable()
export class DeliveriesService {
  constructor(
    private prisma: PrismaService,
    private ordersService: OrdersService,
    private stocksService: StocksService,
  ) {}

  async getAllocations(orderId: string, user: AuthUser) {
    await this.ordersService.ensureOrderAccess(orderId, user);

    const rows = await this.prisma.orderSourceAllocation.findMany({
      where: { orderId },
      orderBy: { createdAt: 'asc' },
      include: {
        coop: { select: { name: true } },
      },
    });

    const userIds = [...new Set(rows.map((row) => row.assignedById))];
    const assigners = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true },
    });
    const assignerMap = new Map(assigners.map((item) => [item.id, item.name]));

    return rows.map((row) => ({
      id: row.id,
      coopId: row.coopId,
      coopName: row.coop.name,
      quantityKg: row.quantityKg.toString(),
      assignedByName: assignerMap.get(row.assignedById) ?? null,
      createdAt: row.createdAt,
    }));
  }

  async startDelivery(orderId: string, user: AuthUser, dto: StartDeliveryDto) {
    const order = await this.ordersService.ensureOrderAccess(orderId, user);

    if (
      order.lifecycleStatus !== OrderLifecycleStatus.ACTIVE ||
      order.deliveryStatus !== DeliveryStatus.BELUM_DIHANTAR
    ) {
      throw new BusinessRuleException(
        'Order cannot start delivery in current status',
      );
    }

    const existingAllocations = await this.prisma.orderSourceAllocation.count({
      where: { orderId },
    });
    if (existingAllocations > 0) {
      throw new BusinessRuleException('Order already has source allocations');
    }

    await this.validateAllocationScope(
      user,
      dto.allocations.map((item) => item.coopId),
    );
    this.validateAllocationTotal(Number(order.quantityKg), dto.allocations);

    if (order.pricePerKg !== null && dto.customPricePerKg !== undefined) {
      throw new BusinessRuleException('Order price is already locked');
    }

    let lockedPricePerKg = order.pricePerKg;
    let lockedPriceSource = order.priceSource;

    if (lockedPricePerKg === null) {
      const isTodayDelivery =
        toDateKey(order.deliveryDate) === getTodayDateKey();

      if (!isTodayDelivery) {
        throw new BusinessRuleException(
          'Order price can only be locked when delivery date is today',
        );
      }

      const eggPrice = await this.prisma.eggPrice.findFirst({
        where: {
          effectiveDate: order.deliveryDate,
          deletedAt: null,
        },
        select: { pricePerKg: true },
      });

      if (!eggPrice) {
        throw new BusinessRuleException(
          'Daily egg price for delivery date is not available',
        );
      }

      lockedPricePerKg =
        dto.customPricePerKg !== undefined
          ? BigInt(String(dto.customPricePerKg))
          : eggPrice.pricePerKg;
      lockedPriceSource =
        dto.customPricePerKg !== undefined
          ? OrderPriceSource.CUSTOM
          : OrderPriceSource.STANDARD;
    }

    const totalInvoice = this.computeInvoice(
      Number(order.quantityKg),
      lockedPricePerKg,
    );

    const movementDate = getTodayDateOnlyUtc();
    const allocationsWithId = dto.allocations.map((item) => ({
      id: generateUuidV7(),
      coopId: item.coopId,
      quantityKg: item.quantityKg,
    }));

    await this.prisma.$transaction(async (tx) => {
      const lockedOrder = await tx.order.updateMany({
        where: {
          id: orderId,
          lifecycleStatus: OrderLifecycleStatus.ACTIVE,
          deliveryStatus: DeliveryStatus.BELUM_DIHANTAR,
        },
        data: {
          deliveryStatus: DeliveryStatus.SEDANG_DIHANTAR,
          startedById: user.id,
          pricePerKg: lockedPricePerKg,
          priceSource: lockedPriceSource,
          totalInvoice,
          updatedById: user.id,
          updatedAt: new Date(),
        },
      });

      if (lockedOrder.count !== 1) {
        throw new BusinessRuleException(
          'Order cannot start delivery in current status',
        );
      }

      const allocationCount = await tx.orderSourceAllocation.count({
        where: { orderId },
      });
      if (allocationCount > 0) {
        throw new BusinessRuleException('Order already has source allocations');
      }

      await this.stocksService.reserveForOrderAllocations(tx, {
        orderId,
        movementDate,
        createdById: user.id,
        allocations: allocationsWithId.map((item) => ({
          sourceId: item.id,
          coopId: item.coopId,
          quantityKg: item.quantityKg,
        })),
      });

      await tx.orderSourceAllocation.createMany({
        data: allocationsWithId.map((item) => ({
          id: item.id,
          orderId,
          coopId: item.coopId,
          quantityKg: item.quantityKg,
          assignedById: user.id,
        })),
      });
    });

    const allocations = await this.getAllocations(orderId, user);

    return {
      orderId,
      deliveryStatus: DeliveryStatus.SEDANG_DIHANTAR,
      pricePerKg: lockedPricePerKg,
      priceSource: lockedPriceSource,
      totalInvoice,
      allocations,
    };
  }

  async completeDelivery(orderId: string, user: AuthUser) {
    const order = await this.ordersService.ensureOrderAccess(orderId, user);

    if (order.deliveryStatus !== DeliveryStatus.SEDANG_DIHANTAR) {
      throw new BusinessRuleException('Order is not in delivery process');
    }

    const updateResult = await this.prisma.order.updateMany({
      where: {
        id: orderId,
        lifecycleStatus: OrderLifecycleStatus.ACTIVE,
        deliveryStatus: DeliveryStatus.SEDANG_DIHANTAR,
        updatedAt: order.updatedAt,
      },
      data: {
        deliveryStatus: DeliveryStatus.SUDAH_DIHANTAR,
        deliveredById: user.id,
        updatedById: user.id,
        updatedAt: new Date(),
      },
    });

    if (updateResult.count !== 1) {
      throw new BusinessRuleException(
        'Order has changed, please reload and retry',
      );
    }

    return {
      orderId,
      deliveryStatus: DeliveryStatus.SUDAH_DIHANTAR,
    };
  }

  async updateAllocations(
    orderId: string,
    user: AuthUser,
    dto: UpdateAllocationsDto,
  ) {
    const order = await this.ordersService.ensureOrderAccess(orderId, user);

    if (order.lifecycleStatus !== OrderLifecycleStatus.ACTIVE) {
      throw new BusinessRuleException(
        'Allocation update not allowed for cancelled order',
      );
    }

    if (order.deliveryStatus !== DeliveryStatus.SEDANG_DIHANTAR) {
      throw new BusinessRuleException(
        'Allocation update is only allowed while delivery is in progress',
      );
    }

    this.validateAllocationTotal(Number(order.quantityKg), dto.allocations);

    const coopIds = dto.allocations.map((item) => item.coopId);
    await this.validateAllocationScope(user, coopIds);

    const expectedUpdatedAt = new Date(dto.orderUpdatedAt);
    const movementDate = getTodayDateOnlyUtc();
    const nextAllocations = dto.allocations.map((item) => ({
      id: generateUuidV7(),
      coopId: item.coopId,
      quantityKg: item.quantityKg,
    }));

    await this.prisma.$transaction(async (tx) => {
      const updateResult = await tx.order.updateMany({
        where: {
          id: orderId,
          lifecycleStatus: OrderLifecycleStatus.ACTIVE,
          deliveryStatus: DeliveryStatus.SEDANG_DIHANTAR,
          updatedAt: expectedUpdatedAt,
        },
        data: {
          updatedById: user.id,
          updatedAt: new Date(),
        },
      });

      if (updateResult.count !== 1) {
        throw new BusinessRuleException(
          'Order allocation has changed, please reload and retry',
        );
      }

      const existingAllocations = await tx.orderSourceAllocation.findMany({
        where: { orderId },
        select: { id: true, coopId: true, quantityKg: true },
      });

      await this.stocksService.reconcileOrderAllocations(tx, {
        orderId,
        movementDate,
        createdById: user.id,
        previousAllocations: existingAllocations,
        nextAllocations,
      });

      await tx.orderSourceAllocation.deleteMany({ where: { orderId } });
      await tx.orderSourceAllocation.createMany({
        data: nextAllocations.map((item) => ({
          id: item.id,
          orderId,
          coopId: item.coopId,
          quantityKg: item.quantityKg,
          assignedById: user.id,
          updatedById: user.id,
          updatedAt: new Date(),
        })),
      });
    });

    return {
      orderId,
      allocations: await this.getAllocations(orderId, user),
    };
  }

  private validateAllocationTotal(
    orderQuantityKg: number,
    allocations: Array<{ quantityKg: number }>,
  ) {
    const total = allocations.reduce((sum, item) => sum + item.quantityKg, 0);
    const normalizedTotal = Number(total.toFixed(3));
    const normalizedOrder = Number(orderQuantityKg.toFixed(3));

    if (normalizedTotal !== normalizedOrder) {
      throw new BusinessRuleException(
        'Total allocation quantity must equal order quantity',
      );
    }
  }

  private computeInvoice(quantityKg: number, pricePerKg: bigint): bigint {
    return BigInt(Math.round(quantityKg * Number(pricePerKg)));
  }

  private async validateAllocationScope(user: AuthUser, coopIds: string[]) {
    const uniqueCoopIds = [...new Set(coopIds)];

    const coops = await this.prisma.coop.findMany({
      where: { id: { in: uniqueCoopIds }, deletedAt: null },
      select: { id: true },
    });

    if (coops.length !== uniqueCoopIds.length) {
      throw new NotFoundException('One or more coop ids are not found');
    }

    if (user.role === Role.ADMIN) {
      return;
    }

    if (user.role !== Role.OPERATOR) {
      throw new ForbiddenException(
        'Only OPERATOR can perform delivery actions',
      );
    }

    const accesses = await this.prisma.userCoopAccess.findMany({
      where: {
        userId: user.id,
        deletedAt: null,
      },
      select: { coopId: true },
    });
    const allowed = new Set(accesses.map((item) => item.coopId));

    if (uniqueCoopIds.some((coopId) => !allowed.has(coopId))) {
      throw new ForbiddenException(
        'One or more allocation coops are outside operator scope',
      );
    }
  }
}
