import { Injectable } from '@nestjs/common';
import { DeliveryStatus, PaymentStatus, Role } from '@prisma/client';
import { PrismaService } from '../prisma';
import {
  BusinessRuleException,
  ForbiddenException,
  generateUuidV7,
} from '../common';
import { OrdersService } from '../orders';
import { CreatePaymentUpdateDto } from './dto';

interface AuthUser {
  id: string;
  role: Role;
}

@Injectable()
export class PaymentsService {
  constructor(
    private prisma: PrismaService,
    private ordersService: OrdersService,
  ) {}

  async updatePayment(
    orderId: string,
    user: AuthUser,
    dto: CreatePaymentUpdateDto,
  ) {
    const order = await this.ordersService.ensureOrderAccess(orderId, user);

    if (
      user.role === Role.OPERATOR &&
      order.deliveryStatus !== DeliveryStatus.SEDANG_DIHANTAR &&
      order.deliveryStatus !== DeliveryStatus.SUDAH_DIHANTAR
    ) {
      throw new ForbiddenException(
        'Operator can only update payment for in-delivery or delivered orders',
      );
    }

    this.validateTransition(order.paymentStatus, dto.paymentStatus);

    if (dto.paymentStatus === PaymentStatus.DP) {
      if (!dto.paymentMethod || dto.amountPaid === undefined) {
        throw new BusinessRuleException(
          'DP requires paymentMethod and amountPaid',
        );
      }

      if (order.paymentStatus !== PaymentStatus.BELUM_BAYAR) {
        throw new BusinessRuleException('Only one DP is allowed per order');
      }
    }

    if (dto.paymentStatus === PaymentStatus.LUNAS && !dto.paymentMethod) {
      throw new BusinessRuleException('LUNAS requires paymentMethod');
    }

    if (
      dto.paymentStatus === PaymentStatus.LUNAS &&
      (order.pricePerKg === null || order.totalInvoice === null)
    ) {
      throw new BusinessRuleException(
        'Order price is not locked yet for this delivery date',
      );
    }

    let amountPaidBigint: bigint | null = null;

    if (dto.paymentStatus === PaymentStatus.DP) {
      if (dto.amountPaid === undefined) {
        throw new BusinessRuleException('DP requires amountPaid');
      }

      amountPaidBigint = BigInt(dto.amountPaid);

      if (amountPaidBigint <= BigInt(0)) {
        throw new BusinessRuleException('DP amountPaid must be greater than 0');
      }

      if (
        order.totalInvoice !== null &&
        amountPaidBigint > order.totalInvoice
      ) {
        throw new BusinessRuleException(
          'DP amountPaid cannot exceed total invoice',
        );
      }
    }

    if (dto.paymentStatus === PaymentStatus.LUNAS) {
      const alreadyPaidDp = order.dpAmount ?? BigInt(0);
      const outstanding = order.totalInvoice! - alreadyPaidDp;

      if (outstanding < BigInt(0)) {
        throw new BusinessRuleException(
          'Order payment data is invalid: dpAmount exceeds total invoice',
        );
      }

      amountPaidBigint = outstanding;
    }

    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.order.updateMany({
        where: {
          id: orderId,
          paymentStatus: order.paymentStatus,
        },
        data: {
          paymentStatus: dto.paymentStatus,
          paymentMethod: dto.paymentMethod ?? null,
          ...(dto.paymentStatus === PaymentStatus.DP
            ? { dpAmount: amountPaidBigint }
            : {}),
          updatedById: user.id,
          updatedAt: new Date(),
        },
      });

      if (updated.count !== 1) {
        throw new BusinessRuleException(
          'Payment status was already updated; please refresh and try again',
        );
      }

      await tx.paymentHistory.create({
        data: {
          id: generateUuidV7(),
          orderId,
          paymentStatus: dto.paymentStatus,
          paymentMethod: dto.paymentMethod ?? null,
          amountPaid: amountPaidBigint,
          notes: dto.notes ?? null,
          updatedById: user.id,
        },
      });
    });

    return { message: 'Payment updated successfully' };
  }

  async getPaymentHistory(orderId: string, user: AuthUser) {
    await this.ordersService.ensureOrderAccess(orderId, user);

    const rows = await this.prisma.paymentHistory.findMany({
      where: { orderId },
      orderBy: { createdAt: 'asc' },
    });

    const updaterIds = [...new Set(rows.map((row) => row.updatedById))];
    const users = await this.prisma.user.findMany({
      where: { id: { in: updaterIds } },
      select: { id: true, name: true },
    });
    const map = new Map(users.map((item) => [item.id, item.name]));

    return rows.map((row) => ({
      id: row.id,
      paymentStatus: row.paymentStatus,
      paymentMethod: row.paymentMethod,
      amountPaid: row.amountPaid,
      notes: row.notes,
      updatedById: row.updatedById,
      updatedByName: map.get(row.updatedById) ?? null,
      createdAt: row.createdAt,
    }));
  }

  private validateTransition(current: PaymentStatus, next: PaymentStatus) {
    if (current === next) {
      throw new BusinessRuleException(
        'Payment status is already current value',
      );
    }

    if (
      current === PaymentStatus.BELUM_BAYAR &&
      next !== PaymentStatus.DP &&
      next !== PaymentStatus.LUNAS
    ) {
      throw new BusinessRuleException(
        'Valid payment flow: BELUM_BAYAR -> (DP or LUNAS)',
      );
    }

    if (current === PaymentStatus.DP && next !== PaymentStatus.LUNAS) {
      throw new BusinessRuleException('Valid payment flow: DP -> LUNAS');
    }

    if (current === PaymentStatus.LUNAS) {
      throw new BusinessRuleException('Payment status LUNAS cannot be changed');
    }
  }
}
