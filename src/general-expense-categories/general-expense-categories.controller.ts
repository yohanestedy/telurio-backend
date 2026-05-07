import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser, Roles } from '../common';
import {
  CreateGeneralExpenseCategoryDto,
  UpdateGeneralExpenseCategoryDto,
} from './dto';
import { GeneralExpenseCategoriesService } from './general-expense-categories.service';

@Controller('general-expense-categories')
export class GeneralExpenseCategoriesController {
  constructor(private service: GeneralExpenseCategoriesService) {}

  @Get()
  @Roles(Role.ADMIN, Role.OWNER)
  async list(@CurrentUser() user: { id: string; role: Role }) {
    return await this.service.listCategories(user);
  }

  @Post()
  @Roles(Role.OWNER)
  async create(
    @CurrentUser() user: { id: string; role: Role },
    @Body() dto: CreateGeneralExpenseCategoryDto,
  ) {
    return await this.service.createCategory(user, dto);
  }

  @Patch(':id')
  @Roles(Role.OWNER)
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: { id: string; role: Role },
    @Body() dto: UpdateGeneralExpenseCategoryDto,
  ) {
    return await this.service.updateCategory(id, user, dto);
  }

  @Delete(':id')
  @Roles(Role.OWNER)
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: { id: string; role: Role },
  ) {
    return await this.service.deleteCategory(id, user);
  }
}
