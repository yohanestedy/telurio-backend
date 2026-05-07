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
  CreateGeneralExpenseDto,
  DeleteGeneralExpenseDto,
  QueryGeneralExpensesDto,
  UpdateGeneralExpenseDto,
} from './dto';
import { GeneralExpensesService } from './general-expenses.service';

@Controller('general-expenses')
export class GeneralExpensesController {
  constructor(private service: GeneralExpensesService) {}

  @Get()
  @Roles(Role.ADMIN, Role.OWNER)
  async list(
    @CurrentUser() user: { id: string; role: Role },
    @Query() query: QueryGeneralExpensesDto,
  ) {
    return await this.service.listGeneralExpenses(user, query);
  }

  @Post()
  @Roles(Role.ADMIN, Role.OWNER)
  async create(
    @CurrentUser() user: { id: string; role: Role },
    @Body() dto: CreateGeneralExpenseDto,
  ) {
    return await this.service.createGeneralExpense(user, dto);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.OWNER)
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: { id: string; role: Role },
    @Body() dto: UpdateGeneralExpenseDto,
  ) {
    return await this.service.updateGeneralExpense(id, user, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.OWNER)
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: { id: string; role: Role },
    @Body() dto: DeleteGeneralExpenseDto,
  ) {
    return await this.service.deleteGeneralExpense(id, user, dto);
  }
}
