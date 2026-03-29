import { Controller, Get, Param, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common';
import { AuditLogsService } from './audit-logs.service';
import { QueryAuditLogsDto } from './dto';

@Controller('audit-logs')
export class AuditLogsController {
  constructor(private service: AuditLogsService) {}

  @Get()
  async list(
    @CurrentUser() user: { id: string; role: Role },
    @Query() query: QueryAuditLogsDto,
  ) {
    return await this.service.listLogs(user, query);
  }

  @Get(':entityType/:entityId')
  async byEntity(
    @Param('entityType') entityType: string,
    @Param('entityId') entityId: string,
    @CurrentUser() user: { id: string; role: Role },
  ) {
    return await this.service.listLogsByEntity(user, entityType, entityId);
  }
}
