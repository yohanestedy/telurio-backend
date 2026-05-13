import { Injectable } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  buildPaginationMeta,
  generateUuidV7,
} from '../common';
import {
  CreateCoopHealthRecordDto,
  DeleteCoopHealthRecordDto,
  QueryCoopHealthRecordsDto,
  UpdateCoopHealthRecordDto,
} from './dto';

interface AuthUser {
  id: string;
  role: Role;
}

const recordInclude = {
  coop: { select: { name: true } },
} satisfies Prisma.CoopHealthRecordInclude;

@Injectable()
export class CoopHealthService {
  constructor(private prisma: PrismaService) {}

  async listRecords(user: AuthUser, query: QueryCoopHealthRecordsDto) {
    const orderByMap: Record<
      string,
      Prisma.CoopHealthRecordOrderByWithRelationInput
    > = {
      date: { date: query.order },
      createdAt: { createdAt: query.order },
      type: { type: query.order },
    };

    const scopedCoopIds = await this.getScopedCoopIds(user);

    if (
      query.coopId &&
      user.role !== Role.ADMIN &&
      !scopedCoopIds.includes(query.coopId)
    ) {
      throw new ForbiddenException('Coop is outside your scope');
    }

    const coopFilter: Prisma.CoopHealthRecordWhereInput['coopId'] = query.coopId
      ? query.coopId
      : user.role === Role.ADMIN
        ? undefined
        : { in: scopedCoopIds };

    const where: Prisma.CoopHealthRecordWhereInput = {
      deletedAt: null,
      ...(coopFilter ? { coopId: coopFilter } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.date
        ? { date: new Date(query.date) }
        : query.startDate || query.endDate
          ? {
              date: {
                ...(query.startDate ? { gte: new Date(query.startDate) } : {}),
                ...(query.endDate ? { lte: new Date(query.endDate) } : {}),
              },
            }
          : {}),
    };

    const orderBy: Prisma.CoopHealthRecordOrderByWithRelationInput[] =
      query.sortBy === 'createdAt'
        ? [orderByMap[query.sortBy]]
        : [orderByMap[query.sortBy], { createdAt: 'desc' }];

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.coopHealthRecord.count({ where }),
      this.prisma.coopHealthRecord.findMany({
        where,
        skip: query.offset,
        take: query.take,
        orderBy,
        include: recordInclude,
      }),
    ]);

    return {
      data: rows.map((row) => this.formatRecord(row)),
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
          type: query.type,
          date: query.date,
          startDate: query.startDate,
          endDate: query.endDate,
        },
      }),
    };
  }

  async getRecord(id: string, user: AuthUser) {
    const record = await this.prisma.coopHealthRecord.findFirst({
      where: { id, deletedAt: null },
      include: recordInclude,
    });

    if (!record) {
      throw new NotFoundException('Coop health record not found');
    }

    await this.ensureCanReadCoop(user, record.coopId);

    return this.formatRecord(record);
  }

  async createRecord(user: AuthUser, dto: CreateCoopHealthRecordDto) {
    await this.ensureActiveCoop(dto.coopId);

    const created = await this.prisma.coopHealthRecord.create({
      data: {
        id: generateUuidV7(),
        date: new Date(dto.date),
        coopId: dto.coopId,
        type: dto.type,
        description: dto.description,
        notes: dto.notes ?? null,
        reminderDate: dto.reminderDate ? new Date(dto.reminderDate) : null,
        reminderEnabled: dto.reminderEnabled ?? false,
        createdById: user.id,
      },
      include: recordInclude,
    });

    return this.formatRecord(created);
  }

  async updateRecord(
    id: string,
    user: AuthUser,
    dto: UpdateCoopHealthRecordDto,
  ) {
    const existing = await this.prisma.coopHealthRecord.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, updatedAt: true },
    });

    if (!existing) {
      throw new NotFoundException('Coop health record not found');
    }

    if (dto.coopId !== undefined) {
      await this.ensureActiveCoop(dto.coopId);
    }

    const updateResult = await this.prisma.coopHealthRecord.updateMany({
      where: { id, deletedAt: null, updatedAt: existing.updatedAt },
      data: {
        ...(dto.date !== undefined ? { date: new Date(dto.date) } : {}),
        ...(dto.coopId !== undefined ? { coopId: dto.coopId } : {}),
        ...(dto.type !== undefined ? { type: dto.type } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description }
          : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
        ...(dto.reminderDate !== undefined
          ? {
              reminderDate: dto.reminderDate
                ? new Date(dto.reminderDate)
                : null,
            }
          : {}),
        ...(dto.reminderEnabled !== undefined
          ? { reminderEnabled: dto.reminderEnabled }
          : {}),
        updatedById: user.id,
        updatedAt: new Date(),
      },
    });

    if (updateResult.count !== 1) {
      throw new ConflictException(
        'Coop health record was already changed, please reload and retry',
      );
    }

    const updated = await this.prisma.coopHealthRecord.findUniqueOrThrow({
      where: { id },
      include: recordInclude,
    });

    return this.formatRecord(updated);
  }

  async deleteRecord(
    id: string,
    user: AuthUser,
    dto: DeleteCoopHealthRecordDto,
  ) {
    const existing = await this.prisma.coopHealthRecord.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });

    if (!existing) {
      throw new NotFoundException('Coop health record not found');
    }

    const deleteResult = await this.prisma.coopHealthRecord.updateMany({
      where: { id, deletedAt: null },
      data: {
        deletedAt: new Date(),
        deletedById: user.id,
        deleteReason: dto.deleteReason,
        updatedById: user.id,
        updatedAt: new Date(),
      },
    });

    if (deleteResult.count !== 1) {
      throw new ConflictException('Coop health record was already deleted');
    }

    return { message: 'Record deleted successfully' };
  }

  private formatRecord(
    record: Prisma.CoopHealthRecordGetPayload<{
      include: typeof recordInclude;
    }>,
  ) {
    return {
      id: record.id,
      date: record.date,
      coopId: record.coopId,
      coopName: record.coop.name,
      type: record.type,
      description: record.description,
      notes: record.notes,
      reminderDate: record.reminderDate,
      reminderEnabled: record.reminderEnabled,
      completedAt: record.completedAt,
      completedById: record.completedById,
      createdByName: null,
      updatedByName: null,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }

  private async ensureActiveCoop(coopId: string) {
    const coop = await this.prisma.coop.findFirst({
      where: { id: coopId, deletedAt: null, isActive: true },
      select: { id: true },
    });

    if (!coop) {
      throw new NotFoundException('Coop not found');
    }
  }

  private async ensureCanReadCoop(user: AuthUser, coopId: string) {
    if (user.role === Role.ADMIN) {
      return;
    }

    const scopedCoopIds = await this.getScopedCoopIds(user);
    if (!scopedCoopIds.includes(coopId)) {
      throw new ForbiddenException('Coop is outside your scope');
    }
  }

  private async getScopedCoopIds(user: AuthUser): Promise<string[]> {
    if (user.role === Role.ADMIN) {
      const coops = await this.prisma.coop.findMany({
        where: { deletedAt: null },
        select: { id: true },
      });
      return coops.map((coop) => coop.id);
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
