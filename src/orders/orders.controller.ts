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
import { OrdersService } from './orders.service';
import {
  CancelOrderDto,
  CreateOrderDto,
  QueryOrdersDto,
  UpdateOrderDto,
} from './dto';

@Controller('orders')
export class OrdersController {
  constructor(private ordersService: OrdersService) {}

  @Get()
  async list(
    @CurrentUser() user: { id: string; role: Role },
    @Query() query: QueryOrdersDto,
  ) {
    return await this.ordersService.listOrders(user, query);
  }

  @Post()
  @Roles(Role.ADMIN)
  async create(
    @CurrentUser() user: { id: string; role: Role },
    @Body() dto: CreateOrderDto,
  ) {
    return await this.ordersService.createOrder(user, dto);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: { id: string; role: Role },
    @Body() dto: UpdateOrderDto,
  ) {
    return await this.ordersService.updateOrder(id, user, dto);
  }

  @Post(':id/cancel')
  @Roles(Role.ADMIN)
  async cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: { id: string; role: Role },
    @Body() dto: CancelOrderDto,
  ) {
    return await this.ordersService.cancelOrder(id, user, dto);
  }
}
