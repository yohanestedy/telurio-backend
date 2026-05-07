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

    const created = await this.prisma.expense.create({
      data: {
        id: generateUuidV7(),
        date: new Date(dto.date),
        coopId: dto.coopId,
        expenseCategoryId: dto.expenseCategoryId ?? null,
        // categoryLabel removed
        description: dto.description ?? null,
        amount: BigInt(dto.amount),
        notes: dto.notes ?? null,
        createdById: user.id,
      },
      include: {
        coop: { select: { name: true } },
      },
    });

    return {
      id: created.id,
      date: created.date,
      coopId: created.coopId,
      coopName: created.coop.name,
      // categoryLabel removed
      expenseCategoryId: created.expenseCategoryId,
      description: created.description,
      amount: created.amount,
      notes: created.notes,
      createdByName: null,
      createdAt: created.createdAt,
    };
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
