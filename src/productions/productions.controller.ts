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
  CreateProductionDto,
  DeleteProductionDto,
  QueryProductionsDto,
  UpdateProductionDto,
} from './dto';
import { ProductionsService } from './productions.service';

@Controller('productions')
export class ProductionsController {
  constructor(private productionsService: ProductionsService) {}

  @Get()
  async list(
    @CurrentUser() user: { id: string; role: Role },
    @Query() query: QueryProductionsDto,
  ) {
    return await this.productionsService.listProductions(user, query);
  }

  @Post()
  @Roles(Role.ADMIN, Role.OPERATOR)
  async create(
    @CurrentUser() user: { id: string; role: Role },
    @Body() dto: CreateProductionDto,
  ) {
    return await this.productionsService.createProduction(user, dto);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: { id: string; role: Role },
    @Body() dto: UpdateProductionDto,
  ) {
    return await this.productionsService.updateProduction(id, user, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: { id: string; role: Role },
    @Body() dto: DeleteProductionDto,
  ) {
    return await this.productionsService.deleteProduction(id, user, dto);
  }
}
