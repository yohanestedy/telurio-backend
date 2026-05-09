import { Injectable } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  generateUuidV7,
} from '../common';
import { CreateExpenseCategoryDto, UpdateExpenseCategoryDto } from './dto';

interface AuthUser {
  id: string;
  role: Role;
}

@Injectable()
export class ExpenseCategoriesService {
  constructor(private prisma: PrismaService) {}

  async listCategories(user: AuthUser) {
    const rows = await this.prisma.expenseCategory.findMany({
      where: {
        deletedAt: null,
        ...(user.role === Role.ADMIN ? {} : { ownerId: user.id }),
      },
      orderBy: [{ ownerId: 'asc' }, { name: 'asc' }],
      include: {
        owner: { select: { name: true } },
      },
    });

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      isActive: row.isActive,
      ownerName: row.owner.name,
    }));
  }

  async createCategory(user: AuthUser, dto: CreateExpenseCategoryDto) {
    if (user.role !== Role.ADMIN && user.role !== Role.OWNER) {
      throw new ForbiddenException('Only ADMIN or OWNER can create categories');
    }

    const ownerId = user.id;
    const normalizedName = this.normalizeCategoryName(dto.name);

    const existing = await this.prisma.expenseCategory.findFirst({
      where: {
        ownerId,
        normalizedName,
        deletedAt: null,
      },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException('Expense category name already exists');
    }

    try {
      const created = await this.prisma.expenseCategory.create({
        data: {
          id: generateUuidV7(),
          ownerId,
          name: dto.name,
          normalizedName,
          createdById: user.id,
        },
      });

      return {
        id: created.id,
        name: created.name,
        isActive: created.isActive,
        ownerName: null,
      };
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException('Expense category name already exists');
      }

      throw error;
    }
  }

  async updateCategory(
    categoryId: string,
    user: AuthUser,
    dto: UpdateExpenseCategoryDto,
  ) {
    const category = await this.prisma.expenseCategory.findFirst({
      where: {
        id: categoryId,
        deletedAt: null,
      },
      include: {
        owner: { select: { name: true } },
      },
    });

    if (!category) {
      throw new NotFoundException('Expense category not found');
    }

    if (category.ownerId !== user.id || user.role !== Role.OWNER) {
      throw new ForbiddenException('Only owner of category can update it');
    }

    if (dto.name !== undefined) {
      const normalizedName = this.normalizeCategoryName(dto.name);
      const duplicate = await this.prisma.expenseCategory.findFirst({
        where: {
          ownerId: category.ownerId,
          normalizedName,
          deletedAt: null,
          NOT: { id: categoryId },
        },
        select: { id: true },
      });

      if (duplicate) {
        throw new ConflictException('Expense category name already exists');
      }
    }

    const updated = await this.prisma.expenseCategory.update({
      where: { id: categoryId },
      data: {
        ...(dto.name !== undefined
          ? {
              name: dto.name,
              normalizedName: this.normalizeCategoryName(dto.name),
            }
          : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        updatedById: user.id,
        updatedAt: new Date(),
      },
      include: {
        owner: { select: { name: true } },
      },
    });

    return {
      id: updated.id,
      name: updated.name,
      isActive: updated.isActive,
      ownerName: updated.owner.name,
    };
  }

  async deleteCategory(categoryId: string, user: AuthUser) {
    if (user.role !== Role.OWNER) {
      throw new ForbiddenException('Only OWNER can delete expense categories');
    }

    const category = await this.prisma.expenseCategory.findFirst({
      where: { id: categoryId, deletedAt: null },
    });

    if (!category) {
      throw new NotFoundException('Expense category not found');
    }

    if (category.ownerId !== user.id) {
      throw new ForbiddenException('Only owner of category can delete it');
    }

    // Soft delete — expenses using this category keep their data (categoryId becomes orphaned but nullable)
    await this.prisma.expenseCategory.update({
      where: { id: categoryId },
      data: {
        deletedAt: new Date(),
        deletedById: user.id,
      },
    });

    // Nullify category reference in expenses
    await this.prisma.expense.updateMany({
      where: { expenseCategoryId: categoryId },
      data: { expenseCategoryId: null },
    });

    return { success: true };
  }

  private normalizeCategoryName(value: string) {
    return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('id-ID');
  }

  private isUniqueConstraintError(error: unknown) {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }
}
