import { Injectable } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  generateUuidV7,
} from '../common';
import {
  CreateGeneralExpenseCategoryDto,
  UpdateGeneralExpenseCategoryDto,
} from './dto';

interface AuthUser {
  id: string;
  role: Role;
}

@Injectable()
export class GeneralExpenseCategoriesService {
  constructor(private prisma: PrismaService) {}

  async listCategories(user: AuthUser) {
    const rows = await this.prisma.generalExpenseCategory.findMany({
      where: {
        deletedAt: null,
        ...(user.role === Role.ADMIN ? {} : { ownerId: user.id }),
      },
      orderBy: [{ ownerId: 'asc' }, { name: 'asc' }],
    });

    // Resolve owner names for ADMIN
    const ownerIds = [...new Set(rows.map((r) => r.ownerId))];
    const owners = ownerIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: ownerIds } },
          select: { id: true, name: true },
        })
      : [];
    const ownerMap = new Map(owners.map((o) => [o.id, o.name]));

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      isActive: row.isActive,
      ownerName: ownerMap.get(row.ownerId) ?? null,
      createdAt: row.createdAt,
    }));
  }

  async createCategory(user: AuthUser, dto: CreateGeneralExpenseCategoryDto) {
    if (user.role !== Role.OWNER) {
      throw new ForbiddenException(
        'Only OWNER can create general expense categories',
      );
    }

    const existing = await this.prisma.generalExpenseCategory.findFirst({
      where: {
        ownerId: user.id,
        deletedAt: null,
        name: { equals: dto.name, mode: 'insensitive' },
      },
    });

    if (existing) {
      throw new ConflictException(
        'General expense category name already exists for this owner',
      );
    }

    const created = await this.prisma.generalExpenseCategory.create({
      data: {
        id: generateUuidV7(),
        ownerId: user.id,
        name: dto.name,
        createdById: user.id,
      },
    });

    return {
      id: created.id,
      name: created.name,
      isActive: created.isActive,
      createdAt: created.createdAt,
    };
  }

  async updateCategory(
    categoryId: string,
    user: AuthUser,
    dto: UpdateGeneralExpenseCategoryDto,
  ) {
    if (user.role !== Role.OWNER) {
      throw new ForbiddenException(
        'Only OWNER can update general expense categories',
      );
    }

    const category = await this.prisma.generalExpenseCategory.findFirst({
      where: { id: categoryId, deletedAt: null },
    });

    if (!category) {
      throw new NotFoundException('General expense category not found');
    }

    if (category.ownerId !== user.id) {
      throw new ForbiddenException(
        'Cannot update category owned by another user',
      );
    }

    if (dto.name) {
      const duplicate = await this.prisma.generalExpenseCategory.findFirst({
        where: {
          ownerId: user.id,
          deletedAt: null,
          name: { equals: dto.name, mode: 'insensitive' },
          id: { not: categoryId },
        },
      });

      if (duplicate) {
        throw new ConflictException(
          'General expense category name already exists',
        );
      }
    }

    const updated = await this.prisma.generalExpenseCategory.update({
      where: { id: categoryId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        updatedById: user.id,
      },
    });

    return {
      id: updated.id,
      name: updated.name,
      isActive: updated.isActive,
      createdAt: updated.createdAt,
    };
  }

  async deleteCategory(categoryId: string, user: AuthUser) {
    if (user.role !== Role.OWNER) {
      throw new ForbiddenException(
        'Only OWNER can delete general expense categories',
      );
    }

    const category = await this.prisma.generalExpenseCategory.findFirst({
      where: { id: categoryId, deletedAt: null },
    });

    if (!category) {
      throw new NotFoundException('General expense category not found');
    }

    if (category.ownerId !== user.id) {
      throw new ForbiddenException('Only owner of category can delete it');
    }

    // Soft delete
    await this.prisma.generalExpenseCategory.update({
      where: { id: categoryId },
      data: {
        deletedAt: new Date(),
        deletedById: user.id,
      },
    });

    // Nullify category reference in general expenses
    await this.prisma.generalExpense.updateMany({
      where: { categoryId },
      data: { categoryId: null },
    });

    return { success: true };
  }
}
