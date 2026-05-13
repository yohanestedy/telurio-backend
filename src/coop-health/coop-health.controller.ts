import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser, Roles } from '../common';
import {
  CreateCoopHealthRecordDto,
  DeleteCoopHealthRecordDto,
  QueryCoopHealthRecordsDto,
  UpdateCoopHealthRecordDto,
} from './dto';
import { CoopHealthService } from './coop-health.service';

@Controller('coop-health')
export class CoopHealthController {
  constructor(private service: CoopHealthService) {}

  @Get()
  @Roles(Role.ADMIN, Role.OWNER, Role.OPERATOR)
  async list(
    @CurrentUser() user: { id: string; role: Role },
    @Query() query: QueryCoopHealthRecordsDto,
  ) {
    return await this.service.listRecords(user, query);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.OWNER, Role.OPERATOR)
  async detail(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: { id: string; role: Role },
  ) {
    return await this.service.getRecord(id, user);
  }

  @Post()
  @Roles(Role.ADMIN)
  async create(
    @CurrentUser() user: { id: string; role: Role },
    @Body() dto: CreateCoopHealthRecordDto,
  ) {
    return await this.service.createRecord(user, dto);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: { id: string; role: Role },
    @Body() dto: UpdateCoopHealthRecordDto,
  ) {
    return await this.service.updateRecord(id, user, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: { id: string; role: Role },
    @Body() dto: DeleteCoopHealthRecordDto,
  ) {
    return await this.service.deleteRecord(id, user, dto);
  }
}
