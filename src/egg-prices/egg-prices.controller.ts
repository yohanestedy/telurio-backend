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
import { EggPricesService } from './egg-prices.service';
import { CreateEggPriceDto, QueryEggPricesDto, UpdateEggPriceDto } from './dto';

@Controller('prices')
export class EggPricesController {
  constructor(private eggPricesService: EggPricesService) {}

  @Get('current')
  async getCurrentPrice() {
    return await this.eggPricesService.getCurrentPrice();
  }

  @Get()
  @Roles(Role.ADMIN)
  async listPrices(@Query() query: QueryEggPricesDto) {
    return await this.eggPricesService.listPrices(query);
  }

  @Post()
  @Roles(Role.ADMIN)
  async createPrice(
    @CurrentUser() user: { id: string },
    @Body() dto: CreateEggPriceDto,
  ) {
    return await this.eggPricesService.createPrice(user, dto);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  async updatePrice(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: { id: string },
    @Body() dto: UpdateEggPriceDto,
  ) {
    return await this.eggPricesService.updatePrice(id, user, dto);
  }
}
