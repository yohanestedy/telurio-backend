import { Injectable } from '@nestjs/common';
import {
  DeliveryStatus,
  OrderLifecycleStatus,
  Prisma,
  Role,
} from '@prisma/client';
import dayjs from 'dayjs';
import { PrismaService } from '../prisma';
import { BusinessRuleException } from '../common';
import { QueryCalendarDto } from './dto';

interface AuthUser {
  id: string;
  role: Role;
}

interface CalendarRange {
  startDate: Date;
  endDate: Date;
}

export interface CalendarItem {
  date: string;
  events: {
    orders: Array<{
      orderId: string;
      customerName: string;
      quantityKg: Prisma.Decimal;
      deliveryStatus: DeliveryStatus;
      paymentStatus: string;
    }>;
    productions: Array<{
      coopId: string;
      coopName: string;
      totalGoodKg: string;
      collectionCount: number;
    }>;
    expenses: Array<{
      coopId: string;
      totalAmount: bigint;
    }>;
    priceUpdates: Array<{
      pricePerKg: bigint;
    }>;
  };
}

@Injectable()
export class CalendarService {
  constructor(private prisma: PrismaService) {}

  async listEvents(user: AuthUser, query: QueryCalendarDto) {
    const range = this.resolveRange(query);
    return await this.fetchCalendarData(user, range);
  }

  async getDayEvents(user: AuthUser, date: string) {
    const target = dayjs(date);
    if (!target.isValid()) {
      throw new BusinessRuleException(
        'Invalid date format, expected YYYY-MM-DD',
      );
    }

    const startDate = target.startOf('day').toDate();
    const endDate = target.endOf('day').toDate();

    const rows = await this.fetchCalendarData(user, { startDate, endDate });

    return (
      rows[0] ?? {
        date: target.format('YYYY-MM-DD'),
        events: {
          orders: [],
          productions: [],
          expenses: [],
          priceUpdates: [],
        },
      }
    );
  }

  private async fetchCalendarData(user: AuthUser, range: CalendarRange) {
    const scopedCoopIds = await this.getScopedCoopIds(user);

    const calendarMap = new Map<string, CalendarItem>();

    const ensureDate = (date: string): CalendarItem => {
      const existing = calendarMap.get(date);
      if (existing) {
        return existing;
      }

      const item: CalendarItem = {
        date,
        events: {
          orders: [],
          productions: [],
          expenses: [],
          priceUpdates: [],
        },
      };

      calendarMap.set(date, item);
      return item;
    };

    const ordersWhere: Prisma.OrderWhereInput = {
      deliveryDate: { gte: range.startDate, lte: range.endDate },
      lifecycleStatus: OrderLifecycleStatus.ACTIVE,
      ...(user.role === Role.ADMIN
        ? {}
        : user.role === Role.OPERATOR
          ? {
              OR: [
                {
                  deliveryStatus: DeliveryStatus.BELUM_DIHANTAR,
                  lifecycleStatus: OrderLifecycleStatus.ACTIVE,
                },
                {
                  allocations: { some: { coopId: { in: scopedCoopIds } } },
                },
              ],
            }
          : {
              allocations: { some: { coopId: { in: scopedCoopIds } } },
            }),
    };

    const orders = await this.prisma.order.findMany({
      where: ordersWhere,
      orderBy: { deliveryDate: 'asc' },
      select: {
        id: true,
        deliveryDate: true,
        quantityKg: true,
        deliveryStatus: true,
        paymentStatus: true,
        customer: { select: { name: true } },
      },
    });

    for (const order of orders) {
      const key = dayjs(order.deliveryDate).format('YYYY-MM-DD');
      ensureDate(key).events.orders.push({
        orderId: order.id,
        customerName: order.customer.name,
        quantityKg: order.quantityKg,
        deliveryStatus: order.deliveryStatus,
        paymentStatus: order.paymentStatus,
      });
    }

    const productionRows = await this.prisma.productionRecord.groupBy({
      by: ['date', 'coopId'],
      where: {
        deletedAt: null,
        date: { gte: range.startDate, lte: range.endDate },
        ...(user.role === Role.ADMIN ? {} : { coopId: { in: scopedCoopIds } }),
      },
      _sum: {
        goodKg: true,
      },
      _count: {
        _all: true,
      },
      orderBy: {
        date: 'asc',
      },
    });

    const productionCoopNames = await this.getCoopNames(
      productionRows.map((row) => row.coopId),
    );

    for (const row of productionRows) {
      const key = dayjs(row.date).format('YYYY-MM-DD');
      ensureDate(key).events.productions.push({
        coopId: row.coopId,
        coopName: productionCoopNames.get(row.coopId) ?? '-',
        totalGoodKg: row._sum.goodKg?.toString() ?? '0.000',
        collectionCount: row._count._all,
      });
    }

    const expenseRows = await this.prisma.expense.groupBy({
      by: ['date', 'coopId'],
      where: {
        deletedAt: null,
        date: { gte: range.startDate, lte: range.endDate },
        ...(user.role === Role.ADMIN ? {} : { coopId: { in: scopedCoopIds } }),
      },
      _sum: {
        amount: true,
      },
      orderBy: {
        date: 'asc',
      },
    });

    for (const row of expenseRows) {
      const key = dayjs(row.date).format('YYYY-MM-DD');
      ensureDate(key).events.expenses.push({
        coopId: row.coopId,
        totalAmount: row._sum.amount ?? BigInt(0),
      });
    }

    const priceRows = await this.prisma.eggPrice.findMany({
      where: {
        deletedAt: null,
        effectiveDate: {
          gte: range.startDate,
          lte: range.endDate,
        },
      },
      orderBy: {
        effectiveDate: 'asc',
      },
      select: {
        effectiveDate: true,
        pricePerKg: true,
      },
    });

    for (const row of priceRows) {
      const key = dayjs(row.effectiveDate).format('YYYY-MM-DD');
      ensureDate(key).events.priceUpdates.push({
        pricePerKg: row.pricePerKg,
      });
    }

    return [...calendarMap.values()].sort((a, b) =>
      a.date.localeCompare(b.date),
    );
  }

  private resolveRange(query: QueryCalendarDto): CalendarRange {
    const today = dayjs();

    if (query.startDate || query.endDate) {
      if (!query.startDate || !query.endDate) {
        throw new BusinessRuleException(
          'startDate and endDate must be provided together',
        );
      }

      const startDate = dayjs(query.startDate);
      const endDate = dayjs(query.endDate);

      if (!startDate.isValid() || !endDate.isValid()) {
        throw new BusinessRuleException(
          'Invalid date format, expected YYYY-MM-DD',
        );
      }

      return {
        startDate: startDate.startOf('day').toDate(),
        endDate: endDate.endOf('day').toDate(),
      };
    }

    const view = query.view ?? 'month';

    if (view === 'day') {
      return {
        startDate: today.startOf('day').toDate(),
        endDate: today.endOf('day').toDate(),
      };
    }

    if (view === 'week') {
      return {
        startDate: today.startOf('week').toDate(),
        endDate: today.endOf('week').toDate(),
      };
    }

    return {
      startDate: today.startOf('month').toDate(),
      endDate: today.endOf('month').toDate(),
    };
  }

  private async getScopedCoopIds(user: AuthUser): Promise<string[]> {
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
        coop: { deletedAt: null },
      },
      select: { coopId: true },
    });

    return accesses.map((item) => item.coopId);
  }

  private async getCoopNames(coopIds: string[]) {
    const uniqueIds = [...new Set(coopIds)];
    if (uniqueIds.length === 0) {
      return new Map<string, string>();
    }

    const coops = await this.prisma.coop.findMany({
      where: {
        id: { in: uniqueIds },
      },
      select: {
        id: true,
        name: true,
      },
    });

    return new Map(coops.map((coop) => [coop.id, coop.name]));
  }
}
