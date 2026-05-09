import { Injectable } from '@nestjs/common';
import {
  DeliveryStatus,
  OrderLifecycleStatus,
  PaymentStatus,
  Prisma,
  Role,
} from '@prisma/client';
import { PrismaService } from '../prisma';
import { NotificationsService } from '../notifications';
import {
  BusinessRuleException,
  buildPaginationMeta,
  ForbiddenException,
  NotFoundException,
  getTodayDateKey,
  getTodayDateOnlyUtc,
  generateUuidV7,
  parseDateOnlyUtc,
  toDateKey,
} from '../common';
import {
  CancelOrderDto,
  CreateOrderDto,
  QueryOrdersDto,
  UpdateOrderDto,
} from './dto';

interface AuthUser {
  id: string;
  role: Role;
}

const ORDER_PRICE_SOURCE = {
  STANDARD: 'STANDARD',
  CUSTOM: 'CUSTOM',
} as const;

type OrderPriceSourceValue =
  (typeof ORDER_PRICE_SOURCE)[keyof typeof ORDER_PRICE_SOURCE];

@Injectable()
export class OrdersService {
  constructor(
    private prisma: PrismaService,
    private notificationsService: NotificationsService,
  ) {}

  async getOrderDetail(id: string, user: AuthUser) {
    await this.ensureOrderAccess(id, user);
    return this.getOrderById(id);
  }

  async listOrders(user: AuthUser, query: QueryOrdersDto) {
    const allowedCoopIds = await this.getAllowedCoopIds(user);

    const scopedWhere: Prisma.OrderWhereInput =
      user.role === Role.ADMIN
        ? {}
        : user.role === Role.OPERATOR
          ? {
              OR: [
                {
                  deliveryStatus: DeliveryStatus.BELUM_DIHANTAR,
                  lifecycleStatus: OrderLifecycleStatus.ACTIVE,
                },
                { allocations: { some: { coopId: { in: allowedCoopIds } } } },
              ],
            }
          : {
              allocations: { some: { coopId: { in: allowedCoopIds } } },
            };

    const where: Prisma.OrderWhereInput = {
      ...scopedWhere,
      ...(query.deliveryDate
        ? { deliveryDate: new Date(query.deliveryDate) }
        : {}),
      ...(query.deliveryStatus ? { deliveryStatus: query.deliveryStatus } : {}),
      ...(query.paymentStatus ? { paymentStatus: query.paymentStatus } : {}),
      ...(query.lifecycleStatus
        ? { lifecycleStatus: query.lifecycleStatus }
        : {}),
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.startDate || query.endDate
        ? {
            deliveryDate: {
              ...(query.startDate ? { gte: new Date(query.startDate) } : {}),
              ...(query.endDate ? { lte: new Date(query.endDate) } : {}),
            },
          }
        : {}),
    };

    const orderByMap: Record<string, Prisma.OrderOrderByWithRelationInput> = {
      deliveryDate: { deliveryDate: query.order },
      createdAt: { createdAt: query.order },
      quantityKg: { quantityKg: query.order },
      deliveryStatus: { deliveryStatus: query.order },
      paymentStatus: { paymentStatus: query.order },
    };

    const orderBy: Prisma.OrderOrderByWithRelationInput[] =
      query.sortBy === 'createdAt'
        ? [orderByMap[query.sortBy]]
        : [orderByMap[query.sortBy], { createdAt: 'desc' }];

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        skip: query.offset,
        take: query.take,
        orderBy,
        include: {
          customer: { select: { id: true, name: true, phone: true } },
        },
      }),
    ]);

    const creatorIds = [...new Set(rows.map((row) => row.createdById))];
    const creators = await this.prisma.user.findMany({
      where: { id: { in: creatorIds } },
      select: { id: true, name: true },
    });
    const creatorMap = new Map(creators.map((item) => [item.id, item.name]));

    return {
      data: rows.map((row) => {
        const rowData = row as Record<string, unknown>;

        return {
          id: row.id,
          customer: row.customer,
          quantityKg: row.quantityKg.toString(),
          pricePerKg: row.pricePerKg,
          priceSource: this.normalizePriceSource(rowData.priceSource),
          totalInvoice: row.totalInvoice,
          deliveryDate: row.deliveryDate,
          deliverBefore: row.deliverBefore,
          lifecycleStatus: row.lifecycleStatus,
          deliveryStatus: row.deliveryStatus,
          paymentStatus: row.paymentStatus,
          paymentMethod: row.paymentMethod,
          dpAmount: row.dpAmount,
          notes: row.notes,
          createdByName: creatorMap.get(row.createdById) ?? null,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        };
      }),
      meta: buildPaginationMeta({
        page: query.page,
        limit: query.limit,
        total,
        sortBy: query.sortBy,
        order: query.order,
        all: query.all,
        filters: {
          all: query.all,
          deliveryDate: query.deliveryDate,
          deliveryStatus: query.deliveryStatus,
          paymentStatus: query.paymentStatus,
          lifecycleStatus: query.lifecycleStatus,
          customerId: query.customerId,
          startDate: query.startDate,
          endDate: query.endDate,
        },
      }),
    };
  }

  async createOrder(user: AuthUser, dto: CreateOrderDto) {
    const idempotencyKey = this.normalizeIdempotencyKey(dto.idempotencyKey);

    if (idempotencyKey) {
      const existing = await this.prisma.order.findFirst({
        where: { createdById: user.id, idempotencyKey },
        select: { id: true },
      });

      if (existing) {
        return this.getOrderById(existing.id);
      }
    }

    const customer = await this.prisma.customer.findFirst({
      where: { id: dto.customerId, deletedAt: null },
      select: { id: true },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    const paymentStatus = dto.paymentStatus ?? PaymentStatus.BELUM_BAYAR;
    const deliveryDate = parseDateOnlyUtc(dto.deliveryDate, 'deliveryDate');
    const todayDateKey = getTodayDateKey();
    const isTodayDelivery = toDateKey(deliveryDate) === todayDateKey;

    if (!isTodayDelivery && dto.customPricePerKg !== undefined) {
      throw new BusinessRuleException(
        'Custom pricePerKg is only allowed when delivery date is today',
      );
    }

    if (paymentStatus === PaymentStatus.LUNAS && !isTodayDelivery) {
      throw new BusinessRuleException(
        'LUNAS is only allowed when delivery date is today',
      );
    }

    if (paymentStatus === PaymentStatus.DP) {
      if (!dto.paymentMethod || dto.dpAmount === undefined) {
        throw new BusinessRuleException(
          'DP requires paymentMethod and dpAmount',
        );
      }
    }

    let lockedPrice: bigint | null = null;
    let lockedPriceSource: OrderPriceSourceValue | null = null;
    let totalInvoice: bigint | null = null;

    if (isTodayDelivery) {
      const eggPrice = await this.prisma.eggPrice.findFirst({
        where: {
          effectiveDate: deliveryDate,
          deletedAt: null,
        },
        select: { pricePerKg: true },
      });

      if (!eggPrice) {
        throw new BusinessRuleException(
          'Daily egg price for delivery date is not available',
        );
      }

      const customPricePerKg =
        dto.customPricePerKg !== undefined
          ? BigInt(String(dto.customPricePerKg))
          : null;

      const selectedPricePerKg = customPricePerKg ?? eggPrice.pricePerKg;
      const selectedPriceSource =
        customPricePerKg !== null
          ? ORDER_PRICE_SOURCE.CUSTOM
          : ORDER_PRICE_SOURCE.STANDARD;

      lockedPrice = selectedPricePerKg;
      lockedPriceSource = selectedPriceSource;
      totalInvoice = this.computeInvoice(dto.quantityKg, selectedPricePerKg);
    }

    if (paymentStatus === PaymentStatus.LUNAS && !dto.paymentMethod) {
      throw new BusinessRuleException('LUNAS requires paymentMethod');
    }

    let created: { id: string };

    try {
      created = await this.prisma.$transaction(async (tx) => {
        const order = await tx.order.create({
          data: {
            id: generateUuidV7(),
            customerId: dto.customerId,
            quantityKg: dto.quantityKg,
            pricePerKg: lockedPrice,
            priceSource: lockedPriceSource,
            totalInvoice,
            deliveryDate,
            deliverBefore: dto.deliverBefore ?? null,
            paymentStatus,
            paymentMethod: dto.paymentMethod ?? null,
            dpAmount: dto.dpAmount !== undefined ? BigInt(dto.dpAmount) : null,
            notes: dto.notes ?? null,
            idempotencyKey,
            createdById: user.id,
          },
        });

        if (paymentStatus !== PaymentStatus.BELUM_BAYAR) {
          await tx.paymentHistory.create({
            data: {
              id: generateUuidV7(),
              orderId: order.id,
              paymentStatus,
              paymentMethod: dto.paymentMethod ?? null,
              amountPaid:
                paymentStatus === PaymentStatus.DP && dto.dpAmount !== undefined
                  ? BigInt(dto.dpAmount)
                  : paymentStatus === PaymentStatus.LUNAS
                    ? order.totalInvoice
                    : null,
              notes: 'Initial payment status at order creation',
              updatedById: user.id,
            },
          });
        }

        return order;
      });
    } catch (error) {
      if (this.isUniqueConstraintError(error) && idempotencyKey) {
        const existing = await this.prisma.order.findFirst({
          where: { createdById: user.id, idempotencyKey },
          select: { id: true },
        });

        if (existing) {
          return this.getOrderById(existing.id);
        }
      }

      throw error;
    }

    const orderDetail = await this.getOrderById(created.id);
    void this.notificationsService.notifyOrderCreated(orderDetail);

    return orderDetail;
  }

  async updateOrder(id: string, user: AuthUser, dto: UpdateOrderDto) {
    const existing = await this.prisma.order.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException('Order not found');
    }

    if (
      existing.lifecycleStatus !== OrderLifecycleStatus.ACTIVE ||
      existing.deliveryStatus !== DeliveryStatus.BELUM_DIHANTAR
    ) {
      throw new BusinessRuleException('Order is not editable');
    }

    const today = getTodayDateOnlyUtc();
    if (existing.deliveryDate < today) {
      throw new BusinessRuleException('Past-date order is not editable');
    }

    let nextDeliveryDate = existing.deliveryDate;
    if (dto.deliveryDate) {
      nextDeliveryDate = parseDateOnlyUtc(dto.deliveryDate, 'deliveryDate');
    }

    const todayDateKey = getTodayDateKey();
    const existingDateKey = toDateKey(existing.deliveryDate);
    const nextDateKey = toDateKey(nextDeliveryDate);
    const nextQuantityKg = dto.quantityKg ?? Number(existing.quantityKg);
    let nextPricePerKg: bigint | null = existing.pricePerKg;
    const existingData = existing as Record<string, unknown>;
    let nextPriceSource: OrderPriceSourceValue | null =
      this.normalizePriceSource(existingData.priceSource);
    let nextTotalInvoice: bigint | null = existing.totalInvoice;

    if (
      existing.paymentStatus === PaymentStatus.LUNAS &&
      nextDateKey !== todayDateKey
    ) {
      throw new BusinessRuleException(
        'LUNAS is only allowed when delivery date is today',
      );
    }

    if (nextDateKey === todayDateKey) {
      const shouldKeepCurrentLockedPrice =
        existing.pricePerKg !== null && existingDateKey === todayDateKey;

      const currentLockedPrice = existing.pricePerKg;

      if (shouldKeepCurrentLockedPrice && currentLockedPrice !== null) {
        nextPricePerKg = currentLockedPrice;
        nextPriceSource = this.normalizePriceSource(existingData.priceSource);
        nextTotalInvoice = this.computeInvoice(
          nextQuantityKg,
          currentLockedPrice,
        );
      } else {
        const eggPrice = await this.prisma.eggPrice.findFirst({
          where: {
            effectiveDate: nextDeliveryDate,
            deletedAt: null,
          },
          select: { pricePerKg: true },
        });

        if (!eggPrice) {
          throw new BusinessRuleException(
            'Daily egg price for delivery date is not available',
          );
        }

        nextPricePerKg = eggPrice.pricePerKg;
        nextPriceSource = ORDER_PRICE_SOURCE.STANDARD;
        nextTotalInvoice = this.computeInvoice(
          nextQuantityKg,
          eggPrice.pricePerKg,
        );
      }
    } else {
      nextPricePerKg = null;
      nextPriceSource = null;
      nextTotalInvoice = null;
    }

    const updateResult = await this.prisma.order.updateMany({
      where: {
        id,
        lifecycleStatus: OrderLifecycleStatus.ACTIVE,
        deliveryStatus: DeliveryStatus.BELUM_DIHANTAR,
        deliveryDate: existing.deliveryDate,
        updatedAt: existing.updatedAt,
      },
      data: {
        ...(dto.quantityKg !== undefined ? { quantityKg: dto.quantityKg } : {}),
        ...(dto.deliveryDate ? { deliveryDate: nextDeliveryDate } : {}),
        ...(dto.deliverBefore !== undefined
          ? { deliverBefore: dto.deliverBefore }
          : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
        pricePerKg: nextPricePerKg,
        priceSource: nextPriceSource,
        totalInvoice: nextTotalInvoice,
        updatedById: user.id,
        updatedAt: new Date(),
      },
    });

    if (updateResult.count !== 1) {
      throw new BusinessRuleException(
        'Order has changed, please reload and retry',
      );
    }

    return this.getOrderById(id);
  }

  async cancelOrder(id: string, user: AuthUser, dto: CancelOrderDto) {
    const existing = await this.prisma.order.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Order not found');
    }

    if (
      existing.lifecycleStatus !== OrderLifecycleStatus.ACTIVE ||
      existing.deliveryStatus !== DeliveryStatus.BELUM_DIHANTAR
    ) {
      throw new BusinessRuleException(
        'Cancel is only allowed for active, not-yet-delivered order',
      );
    }

    const updateResult = await this.prisma.order.updateMany({
      where: {
        id,
        lifecycleStatus: OrderLifecycleStatus.ACTIVE,
        deliveryStatus: DeliveryStatus.BELUM_DIHANTAR,
        updatedAt: existing.updatedAt,
      },
      data: {
        lifecycleStatus: OrderLifecycleStatus.CANCELLED,
        cancelledAt: new Date(),
        cancelledById: user.id,
        cancelReason: dto.cancelReason,
        cancelNotes: dto.cancelNotes ?? null,
        updatedById: user.id,
        updatedAt: new Date(),
      },
    });

    if (updateResult.count !== 1) {
      throw new BusinessRuleException(
        'Order has changed, please reload and retry',
      );
    }

    return this.getOrderById(id);
  }

  async ensureOrderAccess(orderId: string, user: AuthUser) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (user.role === Role.ADMIN) {
      return order;
    }

    const allowedCoopIds = await this.getAllowedCoopIds(user);

    if (
      user.role === Role.OPERATOR &&
      order.deliveryStatus === DeliveryStatus.BELUM_DIHANTAR
    ) {
      return order;
    }

    const relation = await this.prisma.orderSourceAllocation.findFirst({
      where: {
        orderId,
        coopId: { in: allowedCoopIds },
      },
      select: { id: true },
    });

    if (!relation) {
      throw new ForbiddenException('Order is outside your scope');
    }

    return order;
  }

  private async getOrderById(id: string) {
    const row = await this.prisma.order.findUnique({
      where: { id },
      include: {
        customer: { select: { id: true, name: true, phone: true } },
      },
    });

    if (!row) {
      throw new NotFoundException('Order not found');
    }

    const creator = await this.prisma.user.findUnique({
      where: { id: row.createdById },
      select: { name: true },
    });

    const rowData = row as Record<string, unknown>;

    return {
      id: row.id,
      customer: row.customer,
      quantityKg: row.quantityKg.toString(),
      pricePerKg: row.pricePerKg,
      priceSource: this.normalizePriceSource(rowData.priceSource),
      totalInvoice: row.totalInvoice,
      deliveryDate: row.deliveryDate,
      deliverBefore: row.deliverBefore,
      lifecycleStatus: row.lifecycleStatus,
      deliveryStatus: row.deliveryStatus,
      paymentStatus: row.paymentStatus,
      paymentMethod: row.paymentMethod,
      dpAmount: row.dpAmount,
      notes: row.notes,
      createdByName: creator?.name ?? null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private computeInvoice(quantityKg: number, pricePerKg: bigint): bigint {
    const raw = quantityKg * Number(pricePerKg);
    return BigInt(Math.round(raw));
  }

  private normalizePriceSource(value: unknown): OrderPriceSourceValue | null {
    if (value === ORDER_PRICE_SOURCE.STANDARD) {
      return ORDER_PRICE_SOURCE.STANDARD;
    }

    if (value === ORDER_PRICE_SOURCE.CUSTOM) {
      return ORDER_PRICE_SOURCE.CUSTOM;
    }

    return null;
  }

  private async getAllowedCoopIds(user: AuthUser): Promise<string[]> {
    if (user.role === Role.ADMIN) {
      const coops = await this.prisma.coop.findMany({
        where: { deletedAt: null },
        select: { id: true },
      });
      return coops.map((c) => c.id);
    }

    const accesses = await this.prisma.userCoopAccess.findMany({
      where: {
        userId: user.id,
        deletedAt: null,
        coop: { deletedAt: null },
      },
      select: { coopId: true },
    });

    return accesses.map((a) => a.coopId);
  }

  private normalizeIdempotencyKey(value?: string) {
    const normalized = value?.trim();
    return normalized ? normalized : null;
  }

  private isUniqueConstraintError(error: unknown) {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }
}
