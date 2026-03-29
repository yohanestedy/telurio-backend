import { Injectable } from '@nestjs/common';
import {
  DeliveryStatus,
  OrderLifecycleStatus,
  Prisma,
  Role,
} from '@prisma/client';
import dayjs from 'dayjs';
import { PrismaService } from '../prisma';
import {
  BusinessRuleException,
  ForbiddenException,
  NotFoundException,
} from '../common';

interface AuthUser {
  id: string;
  role: Role;
}

interface ReportPeriod {
  month: number;
  year: number;
  startDate: Date;
  endDate: Date;
}

interface IncomeReportQuery {
  coopId?: string;
  month?: number;
  year?: number;
  ownerId?: string;
}

interface MonthlySummaryQuery {
  ownerId?: string;
  month?: number;
  year?: number;
}

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  async getGrossIncome(user: AuthUser, query: IncomeReportQuery) {
    const period = this.getPeriod(query.month, query.year);
    const scopedCoopIds = await this.resolveScopedCoopIds(user, query);
    const coops = await this.getCoopsByIds(scopedCoopIds);

    const allocationRows = await this.prisma.orderSourceAllocation.findMany({
      where: {
        coopId: { in: scopedCoopIds },
        order: {
          lifecycleStatus: OrderLifecycleStatus.ACTIVE,
          deliveryStatus: DeliveryStatus.SUDAH_DIHANTAR,
          deliveryDate: {
            gte: period.startDate,
            lte: period.endDate,
          },
          pricePerKg: { not: null },
        },
      },
      select: {
        coopId: true,
        quantityKg: true,
        order: {
          select: {
            pricePerKg: true,
          },
        },
      },
    });

    const aggregateMap = this.aggregateGrossByCoop(allocationRows);

    return {
      data: coops.map((coop) => {
        const aggregate = aggregateMap.get(coop.id) ?? {
          totalDeliveredKg: '0.000',
          grossIncome: BigInt(0),
          avgPricePerKg: 0,
        };

        return {
          coopId: coop.id,
          coopName: coop.name,
          totalDeliveredKg: aggregate.totalDeliveredKg,
          avgPricePerKg: aggregate.avgPricePerKg,
          grossIncome: aggregate.grossIncome,
          month: period.month,
          year: period.year,
        };
      }),
    };
  }

  async getNetIncome(user: AuthUser, query: IncomeReportQuery) {
    const period = this.getPeriod(query.month, query.year);
    const scopedCoopIds = await this.resolveScopedCoopIds(user, query);
    const coops = await this.getCoopsByIds(scopedCoopIds);

    const grossMap = await this.getGrossByCoop(scopedCoopIds, period);
    const expenseMap = await this.getExpensesByCoop(scopedCoopIds, period);

    return {
      data: coops.map((coop) => {
        const grossIncome = grossMap.get(coop.id) ?? BigInt(0);
        const totalExpenses = expenseMap.get(coop.id) ?? BigInt(0);
        const depreciation = this.computeDepreciation(
          grossIncome,
          coop.depreciationPercent,
        );
        const netIncome = grossIncome - totalExpenses - depreciation;

        return {
          coopId: coop.id,
          coopName: coop.name,
          grossIncome,
          totalExpenses,
          depreciation,
          netIncome,
          month: period.month,
          year: period.year,
        };
      }),
    };
  }

  async getMonthlySummary(user: AuthUser, query: MonthlySummaryQuery) {
    const period = this.getPeriod(query.month, query.year);

    const ownerId =
      user.role === Role.OWNER
        ? user.id
        : (query.ownerId ??
          (() => {
            throw new BusinessRuleException('ownerId is required for admin');
          })());

    if (
      user.role === Role.OWNER &&
      query.ownerId &&
      query.ownerId !== user.id
    ) {
      throw new ForbiddenException('ownerId is outside your scope');
    }

    const owner = await this.prisma.user.findUnique({
      where: { id: ownerId },
      select: { id: true, name: true, role: true },
    });

    if (!owner || owner.role !== Role.OWNER) {
      throw new NotFoundException('Owner not found');
    }

    const accesses = await this.prisma.userCoopAccess.findMany({
      where: {
        userId: ownerId,
        deletedAt: null,
        coop: { deletedAt: null },
      },
      include: {
        coop: {
          select: {
            id: true,
            name: true,
            depreciationPercent: true,
          },
        },
      },
      orderBy: {
        coop: {
          name: 'asc',
        },
      },
    });

    const coopIds = accesses.map((access) => access.coopId);
    const grossMap = await this.getGrossByCoop(coopIds, period);
    const expenseMap = await this.getExpensesByCoop(coopIds, period);

    let totalOwnerShare = BigInt(0);

    const coops = accesses.map((access) => {
      const grossIncome = grossMap.get(access.coopId) ?? BigInt(0);
      const totalExpenses = expenseMap.get(access.coopId) ?? BigInt(0);
      const depreciation = this.computeDepreciation(
        grossIncome,
        access.coop.depreciationPercent,
      );
      const netIncome = grossIncome - totalExpenses - depreciation;
      const ownershipSharePercent =
        access.ownershipSharePercent !== null
          ? Number(access.ownershipSharePercent.toString())
          : 100;
      const ownerShare = BigInt(
        Math.round((Number(netIncome) * ownershipSharePercent) / 100),
      );

      totalOwnerShare += ownerShare;

      return {
        coopId: access.coop.id,
        coopName: access.coop.name,
        ownershipSharePercent,
        grossIncome,
        totalExpenses,
        depreciation,
        netIncome,
        ownerShare,
      };
    });

    return {
      ownerId: owner.id,
      ownerName: owner.name,
      month: period.month,
      year: period.year,
      coops,
      totalOwnerShare,
    };
  }

  private getPeriod(month?: number, year?: number): ReportPeriod {
    const now = dayjs();
    const resolvedMonth = month ?? now.month() + 1;
    const resolvedYear = year ?? now.year();

    const start = dayjs(
      `${resolvedYear}-${String(resolvedMonth).padStart(2, '0')}-01`,
    )
      .startOf('day')
      .toDate();
    const end = dayjs(start).endOf('month').toDate();

    return {
      month: resolvedMonth,
      year: resolvedYear,
      startDate: start,
      endDate: end,
    };
  }

  private async resolveScopedCoopIds(user: AuthUser, query: IncomeReportQuery) {
    let scopedCoopIds: string[];

    if (user.role === Role.ADMIN) {
      if (query.ownerId) {
        const ownerAccesses = await this.prisma.userCoopAccess.findMany({
          where: {
            userId: query.ownerId,
            deletedAt: null,
            coop: { deletedAt: null },
          },
          select: { coopId: true },
        });
        scopedCoopIds = ownerAccesses.map((access) => access.coopId);
      } else {
        const allCoops = await this.prisma.coop.findMany({
          where: { deletedAt: null },
          select: { id: true },
        });
        scopedCoopIds = allCoops.map((coop) => coop.id);
      }
    } else {
      if (query.ownerId && query.ownerId !== user.id) {
        throw new ForbiddenException('ownerId is outside your scope');
      }

      const accesses = await this.prisma.userCoopAccess.findMany({
        where: {
          userId: user.id,
          deletedAt: null,
          coop: { deletedAt: null },
        },
        select: { coopId: true },
      });
      scopedCoopIds = accesses.map((access) => access.coopId);
    }

    if (query.coopId) {
      if (!scopedCoopIds.includes(query.coopId)) {
        throw new ForbiddenException('Coop is outside your scope');
      }
      scopedCoopIds = [query.coopId];
    }

    return scopedCoopIds;
  }

  private async getCoopsByIds(coopIds: string[]) {
    if (coopIds.length === 0) {
      return [] as Array<{
        id: string;
        name: string;
        depreciationPercent: Prisma.Decimal;
      }>;
    }

    return await this.prisma.coop.findMany({
      where: {
        id: { in: coopIds },
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        depreciationPercent: true,
      },
      orderBy: {
        name: 'asc',
      },
    });
  }

  private aggregateGrossByCoop(
    rows: Array<{
      coopId: string;
      quantityKg: Prisma.Decimal;
      order: {
        pricePerKg: bigint | null;
      };
    }>,
  ) {
    const map = new Map<
      string,
      {
        totalKgNumber: number;
        grossIncome: bigint;
      }
    >();

    for (const row of rows) {
      const current = map.get(row.coopId) ?? {
        totalKgNumber: 0,
        grossIncome: BigInt(0),
      };

      const qtyNumber = Number(row.quantityKg.toString());
      const pricePerKg = row.order.pricePerKg ?? BigInt(0);
      const grossPart = BigInt(Math.round(qtyNumber * Number(pricePerKg)));

      current.totalKgNumber += qtyNumber;
      current.grossIncome += grossPart;

      map.set(row.coopId, current);
    }

    const result = new Map<
      string,
      {
        totalDeliveredKg: string;
        grossIncome: bigint;
        avgPricePerKg: number;
      }
    >();

    for (const [coopId, value] of map.entries()) {
      const avgPricePerKg =
        value.totalKgNumber > 0
          ? Math.round(Number(value.grossIncome) / value.totalKgNumber)
          : 0;

      result.set(coopId, {
        totalDeliveredKg: value.totalKgNumber.toFixed(3),
        grossIncome: value.grossIncome,
        avgPricePerKg,
      });
    }

    return result;
  }

  private async getGrossByCoop(coopIds: string[], period: ReportPeriod) {
    if (coopIds.length === 0) {
      return new Map<string, bigint>();
    }

    const rows = await this.prisma.orderSourceAllocation.findMany({
      where: {
        coopId: { in: coopIds },
        order: {
          lifecycleStatus: OrderLifecycleStatus.ACTIVE,
          deliveryStatus: DeliveryStatus.SUDAH_DIHANTAR,
          deliveryDate: {
            gte: period.startDate,
            lte: period.endDate,
          },
          pricePerKg: { not: null },
        },
      },
      select: {
        coopId: true,
        quantityKg: true,
        order: {
          select: { pricePerKg: true },
        },
      },
    });

    const map = new Map<string, bigint>();

    for (const row of rows) {
      const qtyNumber = Number(row.quantityKg.toString());
      const pricePerKg = row.order.pricePerKg ?? BigInt(0);
      const grossPart = BigInt(Math.round(qtyNumber * Number(pricePerKg)));
      map.set(row.coopId, (map.get(row.coopId) ?? BigInt(0)) + grossPart);
    }

    return map;
  }

  private async getExpensesByCoop(coopIds: string[], period: ReportPeriod) {
    if (coopIds.length === 0) {
      return new Map<string, bigint>();
    }

    const grouped = await this.prisma.expense.groupBy({
      by: ['coopId'],
      where: {
        coopId: { in: coopIds },
        deletedAt: null,
        date: {
          gte: period.startDate,
          lte: period.endDate,
        },
      },
      _sum: {
        amount: true,
      },
    });

    return new Map(
      grouped.map((item) => [item.coopId, item._sum.amount ?? BigInt(0)]),
    );
  }

  private computeDepreciation(
    grossIncome: bigint,
    depreciationPercent: Prisma.Decimal,
  ) {
    const percent = Number(depreciationPercent.toString());
    return BigInt(Math.round((Number(grossIncome) * percent) / 100));
  }
}
