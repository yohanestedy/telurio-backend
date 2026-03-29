import { Injectable } from '@nestjs/common';
import { DeliveryStatus, OrderLifecycleStatus, Role } from '@prisma/client';
import { PrismaService } from '../prisma';
import {
  BusinessRuleException,
  ForbiddenException,
  NotFoundException,
  generateUuidV7,
} from '../common';
import { OrdersService } from '../orders';
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

    const totalInvoice = this.computeInvoice(
      Number(order.quantityKg),
      eggPrice.pricePerKg,
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.orderSourceAllocation.createMany({
        data: dto.allocations.map((item) => ({
          id: generateUuidV7(),
          orderId,
          coopId: item.coopId,
          quantityKg: item.quantityKg,
          assignedById: user.id,
        })),
      });

      await tx.order.update({
        where: { id: orderId },
        data: {
          deliveryStatus: DeliveryStatus.SEDANG_DIHANTAR,
          startedById: user.id,
          pricePerKg: eggPrice.pricePerKg,
          totalInvoice,
          updatedById: user.id,
          updatedAt: new Date(),
        },
      });
    });

    const allocations = await this.getAllocations(orderId, user);

    return {
      orderId,
      deliveryStatus: DeliveryStatus.SEDANG_DIHANTAR,
      pricePerKg: eggPrice.pricePerKg,
      totalInvoice,
      allocations,
    };
  }

  async completeDelivery(orderId: string, user: AuthUser) {
    const order = await this.ordersService.ensureOrderAccess(orderId, user);

    if (order.deliveryStatus !== DeliveryStatus.SEDANG_DIHANTAR) {
      throw new BusinessRuleException('Order is not in delivery process');
    }

    await this.prisma.order.update({
      where: { id: orderId },
      data: {
        deliveryStatus: DeliveryStatus.SUDAH_DIHANTAR,
        deliveredById: user.id,
        updatedById: user.id,
        updatedAt: new Date(),
      },
    });

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

    this.validateAllocationTotal(Number(order.quantityKg), dto.allocations);

    const coopIds = dto.allocations.map((item) => item.coopId);
    const coops = await this.prisma.coop.findMany({
      where: { id: { in: coopIds }, deletedAt: null },
      select: { id: true },
    });

    if (coops.length !== coopIds.length) {
      throw new NotFoundException('One or more coop ids are not found');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.orderSourceAllocation.deleteMany({ where: { orderId } });
      await tx.orderSourceAllocation.createMany({
        data: dto.allocations.map((item) => ({
          id: generateUuidV7(),
          orderId,
          coopId: item.coopId,
          quantityKg: item.quantityKg,
          assignedById: user.id,
          updatedById: user.id,
          updatedAt: new Date(),
        })),
      });

      await tx.order.update({
        where: { id: orderId },
        data: {
          updatedById: user.id,
          updatedAt: new Date(),
        },
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
