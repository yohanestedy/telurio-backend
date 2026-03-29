import { Injectable } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import dayjs from 'dayjs';
import { PrismaService } from '../prisma';
import {
  BusinessRuleException,
  ForbiddenException,
  NotFoundException,
  generateUuidV7,
} from '../common';
import {
  CreateExpenseDto,
  DeleteExpenseDto,
  QueryExpensesDto,
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

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.expense.count({ where }),
      this.prisma.expense.findMany({
        where,
        skip: query.skip,
        take: query.limit,
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        include: {
          coop: { select: { name: true } },
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
        categoryLabel: item.categoryLabel,
        expenseCategoryId: item.expenseCategoryId,
        description: item.description,
        amount: item.amount,
        notes: item.notes,
        createdByName: creatorMap.get(item.createdById) ?? null,
        createdAt: item.createdAt,
      })),
      meta: {
        total,
        page: query.page,
        limit: query.limit,
      },
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
        categoryLabel: dto.categoryLabel,
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
      categoryLabel: created.categoryLabel,
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
        ...(dto.categoryLabel !== undefined
          ? { categoryLabel: dto.categoryLabel }
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
      },
    });

    return {
      id: updated.id,
      date: updated.date,
      coopId: updated.coopId,
      coopName: updated.coop.name,
      categoryLabel: updated.categoryLabel,
      expenseCategoryId: updated.expenseCategoryId,
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
