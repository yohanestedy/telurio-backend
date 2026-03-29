import { Controller, Get, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser, Roles } from '../common';
import { ReportsService } from './reports.service';
import { QueryIncomeReportsDto, QueryMonthlySummaryDto } from './dto';

@Controller('reports')
export class ReportsController {
  constructor(private service: ReportsService) {}

  @Get('gross-income')
  @Roles(Role.ADMIN, Role.OWNER, Role.OPERATOR)
  async grossIncome(
    @CurrentUser() user: { id: string; role: Role },
    @Query() query: QueryIncomeReportsDto,
  ) {
    return await this.service.getGrossIncome(user, query);
  }

  @Get('net-income')
  @Roles(Role.ADMIN, Role.OWNER)
  async netIncome(
    @CurrentUser() user: { id: string; role: Role },
    @Query() query: QueryIncomeReportsDto,
  ) {
    return await this.service.getNetIncome(user, query);
  }

  @Get('monthly-summary')
  @Roles(Role.ADMIN, Role.OWNER)
  async monthlySummary(
    @CurrentUser() user: { id: string; role: Role },
    @Query() query: QueryMonthlySummaryDto,
  ) {
    return await this.service.getMonthlySummary(user, query);
  }
}
