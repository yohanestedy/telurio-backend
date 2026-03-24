import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser, Roles } from '../common';
import { CreateCoopDto, QueryCoopsDto, UpdateCoopDto } from './dto';
import { CoopsService } from './coops.service';

@Controller('coops')
export class CoopsController {
  constructor(private coopsService: CoopsService) {}

  @Get()
  async listCoops(
    @CurrentUser() user: { id: string; role: Role },
    @Query() query: QueryCoopsDto,
  ) {
    return this.coopsService.listCoops(user, query);
  }

  @Post()
  @Roles(Role.ADMIN)
  async createCoop(
    @CurrentUser() user: { id: string; role: Role },
    @Body() dto: CreateCoopDto,
  ) {
    return await this.coopsService.createCoop(user, dto);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  async updateCoop(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: { id: string; role: Role },
    @Body() dto: UpdateCoopDto,
  ) {
    return await this.coopsService.updateCoop(id, user, dto);
  }
}
