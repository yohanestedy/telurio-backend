import { Injectable } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma';
import {
  buildPaginationMeta,
  ForbiddenException,
  generateUuidV7,
  NotFoundException,
} from '../common';
import {
  CreateGeneralExpenseDto,
  DeleteGeneralExpenseDto,
  QueryGeneralExpensesDto,
  QueryGeneralExpenseSummaryDto,
  UpdateGeneralExpenseDto,
} from './dto';

interface AuthUser {
  id: string;
  role: Role;
}

@Injectable()
export class GeneralExpensesService {
  constructor(private prisma: PrismaService) {}

  async listGeneralExpenses(user: AuthUser, query: QueryGeneralExpensesDto) {
    const orderByMap: Record<
      string,
      Prisma.GeneralExpenseOrderByWithRelationInput
    > = {
      date: { date: query.order },
      createdAt: { createdAt: query.order },
      amount: { amount: query.order },
    };

    // Scope: ADMIN sees all, OWNER sees only their own
    const ownerScope: Prisma.GeneralExpenseWhereInput =
      user.role === Role.ADMIN
        ? query.ownerId
          ? { ownerId: query.ownerId }
          : {}
        : { ownerId: user.id };

    const where: Prisma.GeneralExpenseWhereInput = {
      deletedAt: null,
      ...ownerScope,
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.startDate || query.endDate
        ? {
            date: {
              ...(query.startDate ? { gte: new Date(query.startDate) } : {}),
              ...(query.endDate ? { lte: new Date(query.endDate) } : {}),
            },
          }
        : {}),
    };

    const orderBy: Prisma.GeneralExpenseOrderByWithRelationInput[] =
      query.sortBy === 'createdAt'
        ? [orderByMap[query.sortBy]]
        : [orderByMap[query.sortBy], { createdAt: 'desc' }];

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.generalExpense.count({ where }),
      this.prisma.generalExpense.findMany({
        where,
        skip: query.offset,
        take: query.take,
        orderBy,
        include: {
          category: { select: { id: true, name: true } },
        },
      }),
    ]);

    const userIds = [
      ...new Set([
        ...rows.map((r) => r.createdById),
        ...rows.map((r) => r.ownerId),
      ]),
    ];
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true },
    });
    const userMap = new Map(users.map((u) => [u.id, u.name]));

    return {
      data: rows.map((item) => ({
        id: item.id,
        ownerId: item.ownerId,
        ownerName: userMap.get(item.ownerId) ?? null,
        date: item.date,
        amount: item.amount,
        description: item.description,
        categoryId: item.categoryId,
        categoryName: item.category?.name ?? null,
        notes: item.notes,
        createdByName: userMap.get(item.createdById) ?? null,
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
          startDate: query.startDate,
          endDate: query.endDate,
          categoryId: query.categoryId,
          ownerId: query.ownerId,
        },
      }),
    };
  }

  async createGeneralExpense(user: AuthUser, dto: CreateGeneralExpenseDto) {
    // Resolve ownerId: OWNER creates for themselves, ADMIN must specify
    const ownerId = this.resolveOwnerId(user, dto.ownerId);

    if (dto.categoryId) {
      await this.validateCategory(dto.categoryId, ownerId);
    }

    const idempotencyKey = this.normalizeIdempotencyKey(dto.idempotencyKey);
    const include = {
      category: { select: { id: true, name: true } },
    } satisfies Prisma.GeneralExpenseInclude;

    if (idempotencyKey) {
      const existing = await this.prisma.generalExpense.findFirst({
        where: { createdById: user.id, idempotencyKey },
        include,
      });

      if (existing) {
        return this.formatGeneralExpense(existing);
      }
    }

    try {
      const created = await this.prisma.generalExpense.create({
        data: {
          id: generateUuidV7(),
          ownerId,
          date: new Date(dto.date),
          amount: BigInt(dto.amount),
          description: dto.description,
          categoryId: dto.categoryId ?? null,
          notes: dto.notes ?? null,
          idempotencyKey,
          createdById: user.id,
        },
        include,
      });

      return this.formatGeneralExpense(created);
    } catch (error) {
      if (idempotencyKey && this.isUniqueConstraintError(error)) {
        const existing = await this.prisma.generalExpense.findFirst({
          where: { createdById: user.id, idempotencyKey },
          include,
        });

        if (existing) {
          return this.formatGeneralExpense(existing);
        }
      }

      throw error;
    }
  }

  private formatGeneralExpense(
    expense: Prisma.GeneralExpenseGetPayload<{
      include: {
        category: { select: { id: true; name: true } };
      };
    }>,
  ) {
    return {
      id: expense.id,
      ownerId: expense.ownerId,
      date: expense.date,
      amount: expense.amount,
      description: expense.description,
      categoryId: expense.categoryId,
      categoryName: expense.category?.name ?? null,
      notes: expense.notes,
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

  async updateGeneralExpense(
    id: string,
    user: AuthUser,
    dto: UpdateGeneralExpenseDto,
  ) {
    const existing = await this.prisma.generalExpense.findFirst({
      where: { id, deletedAt: null },
    });

    if (!existing) {
      throw new NotFoundException('General expense not found');
    }

    // OWNER can only edit their own
    if (user.role === Role.OWNER && existing.ownerId !== user.id) {
      throw new ForbiddenException('Cannot edit expense owned by another user');
    }

    if (dto.categoryId) {
      await this.validateCategory(dto.categoryId, existing.ownerId);
    }

    const updated = await this.prisma.generalExpense.update({
      where: { id },
      data: {
        ...(dto.date !== undefined ? { date: new Date(dto.date) } : {}),
        ...(dto.amount !== undefined ? { amount: BigInt(dto.amount) } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description }
          : {}),
        ...(dto.categoryId !== undefined ? { categoryId: dto.categoryId } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
        updatedById: user.id,
      },
      include: {
        category: { select: { id: true, name: true } },
      },
    });

    return {
      id: updated.id,
      ownerId: updated.ownerId,
      date: updated.date,
      amount: updated.amount,
      description: updated.description,
      categoryId: updated.categoryId,
      categoryName: updated.category?.name ?? null,
      notes: updated.notes,
      createdAt: updated.createdAt,
    };
  }

  async deleteGeneralExpense(
    id: string,
    user: AuthUser,
    dto: DeleteGeneralExpenseDto,
  ) {
    const existing = await this.prisma.generalExpense.findFirst({
      where: { id, deletedAt: null },
    });

    if (!existing) {
      throw new NotFoundException('General expense not found');
    }

    // OWNER can only delete their own
    if (user.role === Role.OWNER && existing.ownerId !== user.id) {
      throw new ForbiddenException(
        'Cannot delete expense owned by another user',
      );
    }

    await this.prisma.generalExpense.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        deletedById: user.id,
        deleteReason: dto.deleteReason ?? null,
      },
    });

    return { success: true };
  }

  async getSummary(user: AuthUser, query: QueryGeneralExpenseSummaryDto) {
    // Resolve date range
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

    const ownerScope: Prisma.GeneralExpenseWhereInput =
      user.role === Role.ADMIN
        ? query.ownerId
          ? { ownerId: query.ownerId }
          : {}
        : { ownerId: user.id };

    const where: Prisma.GeneralExpenseWhereInput = {
      deletedAt: null,
      date: { gte: startDate, lte: endDate },
      ...ownerScope,
    };

    const rows = await this.prisma.generalExpense.findMany({
      where,
      select: {
        amount: true,
        categoryId: true,
        category: { select: { name: true } },
      },
    });

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
      const key = row.categoryId ?? '__uncategorized__';
      const name = row.category?.name ?? 'Tanpa Kategori';
      const existing = categoryMap.get(key);
      if (existing) {
        existing.total += row.amount;
        existing.count += 1;
      } else {
        categoryMap.set(key, {
          categoryId: row.categoryId,
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

  // --- Helpers ---

  private resolveOwnerId(user: AuthUser, dtoOwnerId?: string): string {
    if (user.role === Role.OWNER) {
      return user.id;
    }

    // ADMIN must specify ownerId
    if (!dtoOwnerId) {
      throw new ForbiddenException(
        'ownerId is required when creating as ADMIN',
      );
    }

    return dtoOwnerId;
  }

  private async validateCategory(categoryId: string, ownerId: string) {
    const category = await this.prisma.generalExpenseCategory.findFirst({
      where: { id: categoryId, deletedAt: null, ownerId },
    });
    if (!category) {
      throw new NotFoundException(
        'General expense category not found for this owner',
      );
    }
  }
}
