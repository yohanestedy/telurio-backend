import { Controller, Get } from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser, Roles } from '../common';
import { StocksService } from './stocks.service';

@Controller('stocks')
export class StocksController {
  constructor(private stocksService: StocksService) {}

  @Get('live')
  @Roles(Role.ADMIN, Role.OWNER, Role.OPERATOR)
  async getLiveStock(@CurrentUser() user: { id: string; role: Role }) {
    return await this.stocksService.getLiveStock(user);
  }
}
