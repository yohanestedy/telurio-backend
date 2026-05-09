import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma';
import {
  buildPaginationMeta,
  generateUuidV7,
  NotFoundException,
} from '../common';
import { CreateCustomerDto, QueryCustomersDto, UpdateCustomerDto } from './dto';

interface AuthUserContext {
  id: string;
}

@Injectable()
export class CustomersService {
  constructor(private prisma: PrismaService) {}

  async listCustomers(query: QueryCustomersDto) {
    const orderByMap = {
      createdAt: { createdAt: query.order },
      name: { name: query.order },
      phone: { phone: query.order },
    } satisfies Record<string, Prisma.CustomerOrderByWithRelationInput>;

    const deletedFilter =
      query.isDeleted === true
        ? { deletedAt: { not: null } }
        : query.isDeleted === false
          ? { deletedAt: null }
          : { deletedAt: null };

    const searchFilter = query.search
      ? {
          OR: [
            { name: { contains: query.search, mode: 'insensitive' as const } },
            { phone: { contains: query.search, mode: 'insensitive' as const } },
          ],
        }
      : {};

    const where: Prisma.CustomerWhereInput = {
      ...deletedFilter,
      ...searchFilter,
    };

    const [total, customers] = await this.prisma.$transaction([
      this.prisma.customer.count({ where }),
      this.prisma.customer.findMany({
        where,
        skip: query.offset,
        take: query.take,
        orderBy: orderByMap[query.sortBy],
        select: {
          id: true,
          name: true,
          address: true,
          phone: true,
          createdAt: true,
        },
      }),
    ]);

    return {
      data: customers,
      meta: buildPaginationMeta({
        page: query.page,
        limit: query.limit,
        total,
        sortBy: query.sortBy,
        order: query.order,
        all: query.all,
        filters: {
          all: query.all,
          search: query.search,
          isDeleted: query.isDeleted,
        },
      }),
    };
  }

  async createCustomer(actor: AuthUserContext, dto: CreateCustomerDto) {
    const idempotencyKey = this.normalizeIdempotencyKey(dto.idempotencyKey);
    const select = {
      id: true,
      name: true,
      address: true,
      phone: true,
      createdAt: true,
    } satisfies Prisma.CustomerSelect;

    if (idempotencyKey) {
      const existing = await this.prisma.customer.findFirst({
        where: { createdById: actor.id, idempotencyKey },
        select,
      });

      if (existing) {
        return existing;
      }
    }

    try {
      return await this.prisma.customer.create({
        data: {
          id: generateUuidV7(),
          name: dto.name,
          address: dto.address ?? null,
          phone: dto.phone ?? null,
          idempotencyKey,
          createdById: actor.id,
        },
        select,
      });
    } catch (error) {
      if (idempotencyKey && this.isUniqueConstraintError(error)) {
        const existing = await this.prisma.customer.findFirst({
          where: { createdById: actor.id, idempotencyKey },
          select,
        });

        if (existing) {
          return existing;
        }
      }

      throw error;
    }
  }

  async updateCustomer(
    customerId: string,
    actor: AuthUserContext,
    dto: UpdateCustomerDto,
  ) {
    const existing = await this.prisma.customer.findFirst({
      where: {
        id: customerId,
        deletedAt: null,
      },
      select: { id: true },
    });

    if (!existing) {
      throw new NotFoundException('Customer not found');
    }

    const now = new Date();
    const data: Prisma.CustomerUpdateInput = {
      updatedById: actor.id,
      updatedAt: now,
    };

    if (dto.name !== undefined) {
      data.name = dto.name;
    }
    if (dto.address !== undefined) {
      data.address = dto.address;
    }
    if (dto.phone !== undefined) {
      data.phone = dto.phone;
    }

    if (dto.deleteReason !== undefined) {
      data.deletedAt = now;
      data.deletedById = actor.id;
      data.deleteReason = dto.deleteReason;
    }

    const updated = await this.prisma.customer.update({
      where: { id: customerId },
      data,
      select: {
        id: true,
        name: true,
        address: true,
        phone: true,
        createdAt: true,
      },
    });

    return updated;
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
}
