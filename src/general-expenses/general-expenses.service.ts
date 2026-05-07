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

    const creatorIds = [...new Set(rows.map((r) => r.createdById))];
    const creators = await this.prisma.user.findMany({
      where: { id: { in: creatorIds } },
      select: { id: true, name: true },
    });
    const creatorMap = new Map(creators.map((c) => [c.id, c.name]));

    return {
      data: rows.map((item) => ({
        id: item.id,
        ownerId: item.ownerId,
        date: item.date,
        amount: item.amount,
        description: item.description,
        categoryId: item.categoryId,
        categoryName: item.category?.name ?? null,
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

    const created = await this.prisma.generalExpense.create({
      data: {
        id: generateUuidV7(),
        ownerId,
        date: new Date(dto.date),
        amount: BigInt(dto.amount),
        description: dto.description,
        categoryId: dto.categoryId ?? null,
        notes: dto.notes ?? null,
        createdById: user.id,
      },
      include: {
        category: { select: { id: true, name: true } },
      },
    });

    return {
      id: created.id,
      ownerId: created.ownerId,
      date: created.date,
      amount: created.amount,
      description: created.description,
      categoryId: created.categoryId,
      categoryName: created.category?.name ?? null,
      notes: created.notes,
      createdAt: created.createdAt,
    };
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
