import { Controller, Get, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser, Roles } from '../common';
import { QueryStockMovementsDto } from './dto';
import { StockMovementListResponse, StocksService } from './stocks.service';

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
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    return await this.stocksService.listMovements(user, query);
  }
}
