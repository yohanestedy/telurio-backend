import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma';
import { generateUuidV7, NotFoundException } from '../common';
import { CreateCustomerDto, QueryCustomersDto, UpdateCustomerDto } from './dto';

interface AuthUserContext {
  id: string;
}

@Injectable()
export class CustomersService {
  constructor(private prisma: PrismaService) {}

  async listCustomers(query: QueryCustomersDto) {
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
        skip: query.skip,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
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
      meta: {
        total,
        page: query.page,
        limit: query.limit,
      },
    };
  }

  async createCustomer(actor: AuthUserContext, dto: CreateCustomerDto) {
    const created = await this.prisma.customer.create({
      data: {
        id: generateUuidV7(),
        name: dto.name,
        address: dto.address ?? null,
        phone: dto.phone ?? null,
        createdById: actor.id,
      },
      select: {
        id: true,
        name: true,
        address: true,
        phone: true,
        createdAt: true,
      },
    });

    return created;
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
}
