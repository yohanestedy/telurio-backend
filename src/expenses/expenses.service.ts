import { Injectable } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import dayjs from 'dayjs';
import { PrismaService } from '../prisma';
import {
  BusinessRuleException,
  buildPaginationMeta,
  ForbiddenException,
  NotFoundException,
  generateUuidV7,
} from '../common';
import {
  CreateExpenseDto,
  DeleteExpenseDto,
  QueryExpenseDashboardDto,
  QueryExpensesDto,
  QueryExpenseSummaryDto,
  UpdateExpenseDto,
} from './dto';

interface AuthUser {
  id: string;
  role: Role;
}

@Injectable()
export class ExpensesService {
  constructor(private prisma: PrismaService) {}

  async listExpenses(user: AuthUser, query: QueryExpensesDto) {
    const orderByMap: Record<string, Prisma.ExpenseOrderByWithRelationInput> = {
      date: { date: query.order },
      createdAt: { createdAt: query.order },
      amount: { amount: query.order },
      // categoryLabel: { categoryLabel: query.order },
    };

    const ownerCoopIds = await this.getOwnerCoopIds(user);

    if (user.role === Role.OWNER) {
      if (query.coopId && !ownerCoopIds.includes(query.coopId)) {
        throw new ForbiddenException('Coop is outside owner scope');
      }
      if (query.ownerId && query.ownerId !== user.id) {
        throw new ForbiddenException('ownerId filter is outside owner scope');
      }
    }

    const where: Prisma.ExpenseWhereInput = {
      deletedAt: null,
      ...(query.coopId ? { coopId: query.coopId } : {}),
      ...(query.ownerId ? { createdById: query.ownerId } : {}),
      ...(query.expenseCategoryId
        ? { expenseCategoryId: query.expenseCategoryId }
        : {}),
      ...(query.startDate || query.endDate
        ? {
            date: {
              ...(query.startDate ? { gte: new Date(query.startDate) } : {}),
              ...(query.endDate ? { lte: new Date(query.endDate) } : {}),
            },
          }
        : {}),
      ...(user.role === Role.ADMIN ? {} : { coopId: { in: ownerCoopIds } }),
    };

    const orderBy: Prisma.ExpenseOrderByWithRelationInput[] =
      query.sortBy === 'createdAt'
        ? [orderByMap[query.sortBy]]
        : [orderByMap[query.sortBy], { createdAt: 'desc' }];

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.expense.count({ where }),
      this.prisma.expense.findMany({
        where,
        skip: query.offset,
        take: query.take,
        orderBy,
        include: {
          coop: { select: { name: true } },
          expenseCategory: { select: { name: true } },
        },
      }),
    ]);

    const creatorIds = [...new Set(rows.map((item) => item.createdById))];
    const creators = await this.prisma.user.findMany({
      where: { id: { in: creatorIds } },
      select: { id: true, name: true },
    });
    const creatorMap = new Map(creators.map((item) => [item.id, item.name]));

    return {
      data: rows.map((item) => ({
        id: item.id,
        date: item.date,
        coopId: item.coopId,
        coopName: item.coop.name,
        expenseCategoryId: item.expenseCategoryId,
        expenseCategoryName: item.expenseCategory?.name ?? null,
        description: item.description,
        amount: item.amount,
        notes: item.notes,
        createdByName: creatorMap.get(item.createdById) ?? null,
        createdAt: item.createdAt,
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
          ownerId: query.ownerId,
          startDate: query.startDate,
          endDate: query.endDate,
          expenseCategoryId: query.expenseCategoryId,
        },
      }),
    };
  }

  async createExpense(user: AuthUser, dto: CreateExpenseDto) {
    if (user.role !== Role.ADMIN && user.role !== Role.OWNER) {
      throw new ForbiddenException('Only ADMIN or OWNER can create expense');
    }

    await this.validateCoopScopeForWrite(user, dto.coopId);
    await this.validateExpenseCategory(user, dto.expenseCategoryId ?? null);

    const idempotencyKey = this.normalizeIdempotencyKey(dto.idempotencyKey);
    const include = {
      coop: { select: { name: true } },
    } satisfies Prisma.ExpenseInclude;

    if (idempotencyKey) {
      const existing = await this.prisma.expense.findFirst({
        where: { createdById: user.id, idempotencyKey },
        include,
      });

      if (existing) {
        return this.formatExpense(existing);
      }
    }

    try {
      const created = await this.prisma.expense.create({
        data: {
          id: generateUuidV7(),
          date: new Date(dto.date),
          coopId: dto.coopId,
          expenseCategoryId: dto.expenseCategoryId ?? null,
          // categoryLabel removed
          description: dto.description ?? null,
          amount: BigInt(dto.amount),
          idempotencyKey,
          createdById: user.id,
        },
        include,
      });

      return this.formatExpense(created);
    } catch (error) {
      if (idempotencyKey && this.isUniqueConstraintError(error)) {
        const existing = await this.prisma.expense.findFirst({
          where: { createdById: user.id, idempotencyKey },
          include,
        });

        if (existing) {
          return this.formatExpense(existing);
        }
      }

      throw error;
    }
  }

  private formatExpense(
    expense: Prisma.ExpenseGetPayload<{
      include: { coop: { select: { name: true } } };
    }>,
  ) {
    return {
      id: expense.id,
      date: expense.date,
      coopId: expense.coopId,
      coopName: expense.coop.name,
      expenseCategoryId: expense.expenseCategoryId,
      description: expense.description,
      amount: expense.amount,
      notes: expense.notes,
      createdByName: null,
      createdAt: expense.createdAt,
    };
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

  async updateExpense(
    expenseId: string,
    user: AuthUser,
    dto: UpdateExpenseDto,
  ) {
    const expense = await this.prisma.expense.findFirst({
      where: { id: expenseId, deletedAt: null },
      select: {
        id: true,
        coopId: true,
        createdById: true,
        createdAt: true,
      },
    });

    if (!expense) {
      throw new NotFoundException('Expense not found');
    }

    await this.authorizeOwnerOrAdminForRecord(
      user,
      expense.createdById,
      expense.coopId,
    );

    if (user.role === Role.OWNER) {
      const editableUntil = dayjs(expense.createdAt).add(7, 'day');
      if (dayjs().isAfter(editableUntil)) {
        throw new BusinessRuleException(
          'Owner can edit expense only within 7 days after creation',
        );
      }
    }

    const updated = await this.prisma.expense.update({
      where: { id: expenseId },
      data: {
        ...(dto.date !== undefined ? { date: new Date(dto.date) } : {}),
        ...(dto.expenseCategoryId !== undefined
          ? { expenseCategoryId: dto.expenseCategoryId }
          : {}),
        ...(dto.description !== undefined
          ? { description: dto.description }
          : {}),
        ...(dto.amount !== undefined ? { amount: BigInt(dto.amount) } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
        updatedById: user.id,
        updatedAt: new Date(),
      },
      include: {
        coop: { select: { name: true } },
        expenseCategory: { select: { name: true } },
      },
    });

    return {
      id: updated.id,
      date: updated.date,
      coopId: updated.coopId,
      coopName: updated.coop.name,
      expenseCategoryId: updated.expenseCategoryId,
      expenseCategoryName: updated.expenseCategory?.name ?? null,
      description: updated.description,
      amount: updated.amount,
      notes: updated.notes,
      createdAt: updated.createdAt,
    };
  }

  async deleteExpense(
    expenseId: string,
    user: AuthUser,
    dto: DeleteExpenseDto,
  ) {
    const expense = await this.prisma.expense.findFirst({
      where: { id: expenseId, deletedAt: null },
      select: {
        id: true,
        coopId: true,
        createdById: true,
      },
    });

    if (!expense) {
      throw new NotFoundException('Expense not found');
    }

    await this.authorizeOwnerOrAdminForRecord(
      user,
      expense.createdById,
      expense.coopId,
    );

    await this.prisma.expense.update({
      where: { id: expenseId },
      data: {
        deletedAt: new Date(),
        deletedById: user.id,
        deleteReason: dto.deleteReason,
        updatedById: user.id,
        updatedAt: new Date(),
      },
    });

    return {
      message: 'Expense deleted successfully',
    };
  }

  private async validateCoopScopeForWrite(user: AuthUser, coopId: string) {
    const coop = await this.prisma.coop.findFirst({
      where: {
        id: coopId,
        deletedAt: null,
      },
      select: { id: true },
    });

    if (!coop) {
      throw new NotFoundException('Coop not found');
    }

    if (user.role === Role.ADMIN) {
      return;
    }

    const ownerCoopIds = await this.getOwnerCoopIds(user);
    if (!ownerCoopIds.includes(coopId)) {
      throw new ForbiddenException('Coop is outside owner scope');
    }
  }

  private async validateExpenseCategory(
    user: AuthUser,
    expenseCategoryId: string | null,
  ) {
    if (!expenseCategoryId) {
      return;
    }

    const category = await this.prisma.expenseCategory.findFirst({
      where: {
        id: expenseCategoryId,
        deletedAt: null,
      },
      select: { id: true, ownerId: true },
    });

    if (!category) {
      throw new NotFoundException('Expense category not found');
    }

    if (user.role === Role.OWNER && category.ownerId !== user.id) {
      throw new ForbiddenException('Expense category is outside owner scope');
    }
  }

  private async authorizeOwnerOrAdminForRecord(
    user: AuthUser,
    recordCreatedById: string,
    coopId: string,
  ) {
    if (user.role === Role.ADMIN) {
      return;
    }

    if (user.role !== Role.OWNER || recordCreatedById !== user.id) {
      throw new ForbiddenException(
        'Only admin or owner who created the record can modify it',
      );
    }

    const ownerCoopIds = await this.getOwnerCoopIds(user);
    if (!ownerCoopIds.includes(coopId)) {
      throw new ForbiddenException('Expense coop is outside owner scope');
    }
  }

  async getSummary(user: AuthUser, query: QueryExpenseSummaryDto) {
    const ownerCoopIds = await this.getOwnerCoopIds(user);

    // Resolve date range: custom range > month/year > current month
    let startDate: Date;
    let endDate: Date;

    if (query.startDate && query.endDate) {
      startDate = new Date(query.startDate);
      endDate = new Date(query.endDate);
    } else {
      const now = new Date();
      const month = query.month ?? now.getMonth() + 1;
      const year = query.year ?? now.getFullYear();
      startDate = new Date(`${year}-${String(month).padStart(2, '0')}-01`);
      endDate = new Date(startDate);
      endDate.setMonth(endDate.getMonth() + 1);
      endDate.setDate(endDate.getDate() - 1);
    }

    const where: Prisma.ExpenseWhereInput = {
      deletedAt: null,
      date: { gte: startDate, lte: endDate },
      ...(query.coopId ? { coopId: query.coopId } : {}),
      ...(user.role === Role.ADMIN ? {} : { coopId: { in: ownerCoopIds } }),
    };

    const rows = await this.prisma.expense.findMany({
      where,
      select: {
        amount: true,
        expenseCategoryId: true,
        expenseCategory: { select: { name: true } },
      },
    });

    // Group by category
    const categoryMap = new Map<
      string,
      {
        categoryId: string | null;
        categoryName: string;
        total: bigint;
        count: number;
      }
    >();

    let grandTotal = BigInt(0);

    for (const row of rows) {
      const key = row.expenseCategoryId ?? '__uncategorized__';
      const name = row.expenseCategory?.name ?? 'Tanpa Kategori';
      const existing = categoryMap.get(key);
      if (existing) {
        existing.total += row.amount;
        existing.count += 1;
      } else {
        categoryMap.set(key, {
          categoryId: row.expenseCategoryId,
          categoryName: name,
          total: row.amount,
          count: 1,
        });
      }
      grandTotal += row.amount;
    }

    return {
      startDate,
      endDate,
      totalAmount: grandTotal,
      totalCount: rows.length,
      categories: [...categoryMap.values()]
        .sort((a, b) => Number(b.total - a.total))
        .map((c) => ({
          categoryId: c.categoryId,
          categoryName: c.categoryName,
          totalAmount: c.total,
          count: c.count,
        })),
    };
  }

  async getDashboardOverview(user: AuthUser, query: QueryExpenseDashboardDto) {
    const ownerCoopIds = await this.getOwnerCoopIds(user);

    // Resolve current period
    const now = new Date();
    const month = query.month ?? now.getMonth() + 1;
    const year = query.year ?? now.getFullYear();
    const startDate = new Date(`${year}-${String(month).padStart(2, '0')}-01`);
    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + 1);
    endDate.setDate(endDate.getDate() - 1);

    // Previous period (same duration, previous month)
    const prevStartDate = new Date(startDate);
    prevStartDate.setMonth(prevStartDate.getMonth() - 1);
    const prevEndDate = new Date(prevStartDate);
    prevEndDate.setMonth(prevEndDate.getMonth() + 1);
    prevEndDate.setDate(prevEndDate.getDate() - 1);

    // --- Coop Expenses ---
    // Resolve coop scope: specific coop > owner's coops > all (admin) / own coops (owner)
    let coopScope: Prisma.ExpenseWhereInput = {};
    if (query.coopId) {
      coopScope = { coopId: query.coopId };
    } else if (user.role === Role.ADMIN && query.ownerId) {
      // ADMIN filtering by owner: resolve that owner's coops
      const ownerAccesses = await this.prisma.userCoopAccess.findMany({
        where: {
          userId: query.ownerId,
          deletedAt: null,
          coop: { deletedAt: null },
        },
        select: { coopId: true },
      });
      const ownerCoopIdList = ownerAccesses.map((a) => a.coopId);
      coopScope = { coopId: { in: ownerCoopIdList } };
    } else if (user.role !== Role.ADMIN) {
      coopScope = { coopId: { in: ownerCoopIds } };
    }

    const coopWhere: Prisma.ExpenseWhereInput = {
      deletedAt: null,
      date: { gte: startDate, lte: endDate },
      ...coopScope,
    };

    const coopRows = await this.prisma.expense.findMany({
      where: coopWhere,
      select: {
        amount: true,
        expenseCategoryId: true,
        expenseCategory: { select: { name: true } },
      },
    });

    const coopPrevRows = await this.prisma.expense.findMany({
      where: { ...coopWhere, date: { gte: prevStartDate, lte: prevEndDate } },
      select: { amount: true },
    });

    // --- General Expenses ---
    const generalWhere: Prisma.GeneralExpenseWhereInput = {
      deletedAt: null,
      date: { gte: startDate, lte: endDate },
      ...(user.role === Role.ADMIN
        ? query.ownerId
          ? { ownerId: query.ownerId }
          : {}
        : { ownerId: user.id }),
    };

    const generalRows = await this.prisma.generalExpense.findMany({
      where: generalWhere,
      select: {
        amount: true,
        categoryId: true,
        category: { select: { name: true } },
      },
    });

    const generalPrevRows = await this.prisma.generalExpense.findMany({
      where: {
        ...generalWhere,
        date: { gte: prevStartDate, lte: prevEndDate },
      },
      select: { amount: true },
    });

    // --- Aggregate ---
    let coopTotal = BigInt(0);
    let generalTotal = BigInt(0);
    let coopPrevTotal = BigInt(0);
    let generalPrevTotal = BigInt(0);

    const coopCategoryMap = new Map<
      string,
      { name: string; total: bigint; count: number }
    >();
    const generalCategoryMap = new Map<
      string,
      { name: string; total: bigint; count: number }
    >();

    for (const row of coopRows) {
      coopTotal += row.amount;
      const key = row.expenseCategoryId ?? '__uncategorized__';
      const name = row.expenseCategory?.name ?? 'Tanpa Kategori';
      const existing = coopCategoryMap.get(key);
      if (existing) {
        existing.total += row.amount;
        existing.count += 1;
      } else {
        coopCategoryMap.set(key, { name, total: row.amount, count: 1 });
      }
    }

    for (const row of generalRows) {
      generalTotal += row.amount;
      const key = row.categoryId ?? '__uncategorized__';
      const name = row.category?.name ?? 'Tanpa Kategori';
      const existing = generalCategoryMap.get(key);
      if (existing) {
        existing.total += row.amount;
        existing.count += 1;
      } else {
        generalCategoryMap.set(key, { name, total: row.amount, count: 1 });
      }
    }

    for (const row of coopPrevRows) coopPrevTotal += row.amount;
    for (const row of generalPrevRows) generalPrevTotal += row.amount;

    const grandTotal = coopTotal + generalTotal;
    const prevGrandTotal = coopPrevTotal + generalPrevTotal;

    function calcChange(current: bigint, previous: bigint) {
      if (previous === BigInt(0)) {
        return {
          percentage: current > BigInt(0) ? 100 : 0,
          direction: current > BigInt(0) ? ('up' as const) : ('flat' as const),
        };
      }
      const diff = Number(current - previous);
      const pct = Math.round((diff / Number(previous)) * 100);
      return {
        percentage: Math.abs(pct),
        direction:
          pct > 0
            ? ('up' as const)
            : pct < 0
              ? ('down' as const)
              : ('flat' as const),
      };
    }

    return {
      month,
      year,
      total: {
        amount: grandTotal,
        count: coopRows.length + generalRows.length,
        change: calcChange(grandTotal, prevGrandTotal),
      },
      coop: {
        amount: coopTotal,
        count: coopRows.length,
        change: calcChange(coopTotal, coopPrevTotal),
        topCategories: [...coopCategoryMap.values()]
          .sort((a, b) => Number(b.total - a.total))
          .slice(0, 5)
          .map((c) => ({ name: c.name, amount: c.total, count: c.count })),
      },
      general: {
        amount: generalTotal,
        count: generalRows.length,
        change: calcChange(generalTotal, generalPrevTotal),
        topCategories: [...generalCategoryMap.values()]
          .sort((a, b) => Number(b.total - a.total))
          .slice(0, 5)
          .map((c) => ({ name: c.name, amount: c.total, count: c.count })),
      },
    };
  }

  private async getOwnerCoopIds(user: AuthUser): Promise<string[]> {
    if (user.role !== Role.OWNER) {
      return [];
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
}
