import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser, Roles } from '../common';
import { CreateExpenseCategoryDto, UpdateExpenseCategoryDto } from './dto';
import { ExpenseCategoriesService } from './expense-categories.service';

@Controller('expense-categories')
export class ExpenseCategoriesController {
  constructor(private service: ExpenseCategoriesService) {}

  @Get()
  @Roles(Role.ADMIN, Role.OWNER)
  async list(@CurrentUser() user: { id: string; role: Role }) {
    return await this.service.listCategories(user);
  }

  @Post()
  @Roles(Role.OWNER)
  async create(
    @CurrentUser() user: { id: string; role: Role },
    @Body() dto: CreateExpenseCategoryDto,
  ) {
    return await this.service.createCategory(user, dto);
  }

  @Patch(':id')
  @Roles(Role.OWNER)
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: { id: string; role: Role },
    @Body() dto: UpdateExpenseCategoryDto,
  ) {
    return await this.service.updateCategory(id, user, dto);
  }
}
