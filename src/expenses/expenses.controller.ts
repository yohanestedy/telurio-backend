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
  CreateExpenseDto,
  DeleteExpenseDto,
  QueryExpensesDto,
  UpdateExpenseDto,
} from './dto';
import { ExpensesService } from './expenses.service';

@Controller('expenses')
export class ExpensesController {
  constructor(private service: ExpensesService) {}

  @Get()
  @Roles(Role.ADMIN, Role.OWNER)
  async list(
    @CurrentUser() user: { id: string; role: Role },
    @Query() query: QueryExpensesDto,
  ) {
    return await this.service.listExpenses(user, query);
  }

  @Post()
  @Roles(Role.ADMIN, Role.OWNER)
  async create(
    @CurrentUser() user: { id: string; role: Role },
    @Body() dto: CreateExpenseDto,
  ) {
    return await this.service.createExpense(user, dto);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.OWNER)
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: { id: string; role: Role },
    @Body() dto: UpdateExpenseDto,
  ) {
    return await this.service.updateExpense(id, user, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.OWNER)
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: { id: string; role: Role },
    @Body() dto: DeleteExpenseDto,
  ) {
    return await this.service.deleteExpense(id, user, dto);
  }
}
