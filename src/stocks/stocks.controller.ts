import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser, Roles } from '../common';
import { CreateManualStockAdjustmentDto, QueryStockMovementsDto } from './dto';
import {
  ManualStockAdjustmentResponse,
  StockMovementListResponse,
  StocksService,
} from './stocks.service';

@Controller('stocks')
export class StocksController {
  constructor(private stocksService: StocksService) {}

  @Get('live')
  @Roles(Role.ADMIN, Role.OWNER, Role.OPERATOR)
  async getLiveStock(@CurrentUser() user: { id: string; role: Role }) {
    return await this.stocksService.getLiveStock(user);
  }

  @Get('movements')
  @Roles(Role.ADMIN, Role.OWNER, Role.OPERATOR)
  async listMovements(
    @CurrentUser() user: { id: string; role: Role },
    @Query() query: QueryStockMovementsDto,
  ): Promise<StockMovementListResponse> {
    return await this.stocksService.listMovements(user, query);
  }

  @Post('manual-adjustments')
  @Roles(Role.ADMIN, Role.OWNER, Role.OPERATOR)
  async createManualAdjustment(
    @CurrentUser() user: { id: string; role: Role },
    @Body() dto: CreateManualStockAdjustmentDto,
  ): Promise<ManualStockAdjustmentResponse> {
    return await this.stocksService.createManualAdjustment(user, dto);
  }
}
