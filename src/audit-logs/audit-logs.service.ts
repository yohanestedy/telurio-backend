import { Injectable } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma';
import { ForbiddenException } from '../common';
import { QueryAuditLogsDto } from './dto';

interface AuthUser {
  id: string;
  role: Role;
}

@Injectable()
export class AuditLogsService {
  constructor(private prisma: PrismaService) {}

  async listLogs(user: AuthUser, query: QueryAuditLogsDto) {
    const where = await this.buildWhere(user, query);

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        skip: query.skip,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return {
      data: rows.map((row) => ({
        id: row.id,
        entityType: row.entityType,
        entityId: row.entityId,
        actionType: row.actionType,
        actorName: row.actorName,
        coopId: row.coopId,
        summary: row.summary,
        beforeDataJson: row.beforeDataJson,
        afterDataJson: row.afterDataJson,
        metadataJson: row.metadataJson,
        createdAt: row.createdAt,
      })),
      meta: {
        total,
        page: query.page,
        limit: query.limit,
      },
    };
  }

  async listLogsByEntity(user: AuthUser, entityType: string, entityId: string) {
    const where = await this.buildWhere(user, {
      page: 1,
      limit: 100,
      entityType,
      entityId,
      skip: 0,
    } as QueryAuditLogsDto);

    const rows = await this.prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    return rows.map((row) => ({
      id: row.id,
      entityType: row.entityType,
      entityId: row.entityId,
      actionType: row.actionType,
      actorName: row.actorName,
      coopId: row.coopId,
      summary: row.summary,
      beforeDataJson: row.beforeDataJson,
      afterDataJson: row.afterDataJson,
      metadataJson: row.metadataJson,
      createdAt: row.createdAt,
    }));
  }

  private async buildWhere(user: AuthUser, query: QueryAuditLogsDto) {
    const baseWhere: Prisma.AuditLogWhereInput = {
      ...(query.entityType ? { entityType: query.entityType } : {}),
      ...(query.entityId ? { entityId: query.entityId } : {}),
      ...(query.actorUserId ? { actorUserId: query.actorUserId } : {}),
      ...(query.coopId ? { coopId: query.coopId } : {}),
      ...(query.startDate || query.endDate
        ? {
            createdAt: {
              ...(query.startDate ? { gte: new Date(query.startDate) } : {}),
              ...(query.endDate ? { lte: new Date(query.endDate) } : {}),
            },
          }
        : {}),
    };

    if (user.role === Role.ADMIN) {
      return baseWhere;
    }

    const scopedCoopIds = await this.getScopedCoopIds(user);

    if (query.coopId && !scopedCoopIds.includes(query.coopId)) {
      throw new ForbiddenException('Coop is outside your scope');
    }

    return {
      AND: [
        baseWhere,
        {
          OR: [
            { coopId: { in: scopedCoopIds } },
            {
              AND: [{ coopId: null }, { actorUserId: user.id }],
            },
          ],
        },
      ],
    } satisfies Prisma.AuditLogWhereInput;
  }

  private async getScopedCoopIds(user: AuthUser): Promise<string[]> {
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
