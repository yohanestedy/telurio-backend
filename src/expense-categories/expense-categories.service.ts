import { Injectable } from '@nestjs/common';
import { Role } from '@prisma/client';
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
    if (user.role !== Role.OWNER) {
      throw new ForbiddenException('Only OWNER can create expense categories');
    }

    const existing = await this.prisma.expenseCategory.findFirst({
      where: {
        ownerId: user.id,
        deletedAt: null,
        name: { equals: dto.name, mode: 'insensitive' },
      },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException(
        'Expense category name already exists for this owner',
      );
    }

    const created = await this.prisma.expenseCategory.create({
      data: {
        id: generateUuidV7(),
        ownerId: user.id,
        name: dto.name,
        createdById: user.id,
      },
      include: {
        owner: { select: { name: true } },
      },
    });

    return {
      id: created.id,
      name: created.name,
      isActive: created.isActive,
      ownerName: created.owner.name,
    };
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
      const duplicate = await this.prisma.expenseCategory.findFirst({
        where: {
          ownerId: user.id,
          deletedAt: null,
          NOT: { id: categoryId },
          name: { equals: dto.name, mode: 'insensitive' },
        },
        select: { id: true },
      });

      if (duplicate) {
        throw new ConflictException(
          'Expense category name already exists for this owner',
        );
      }
    }

    const updated = await this.prisma.expenseCategory.update({
      where: { id: categoryId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
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
}
