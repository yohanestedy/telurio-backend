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
import { DeliveriesService } from './deliveries.service';
import { StartDeliveryDto, UpdateAllocationsDto } from './dto';

@Controller('orders')
export class DeliveriesController {
  constructor(private deliveriesService: DeliveriesService) {}

  @Get(':id/allocations')
  async getAllocations(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: { id: string; role: Role },
  ) {
    return await this.deliveriesService.getAllocations(id, user);
  }

  @Post(':id/start-delivery')
  @Roles(Role.ADMIN, Role.OPERATOR)
  async startDelivery(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: { id: string; role: Role },
    @Body() dto: StartDeliveryDto,
  ) {
    return await this.deliveriesService.startDelivery(id, user, dto);
  }

  @Post(':id/complete-delivery')
  @Roles(Role.OPERATOR)
  async completeDelivery(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: { id: string; role: Role },
  ) {
    return await this.deliveriesService.completeDelivery(id, user);
  }

  @Patch(':id/allocations')
  @Roles(Role.ADMIN)
  async updateAllocations(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: { id: string; role: Role },
    @Body() dto: UpdateAllocationsDto,
  ) {
    return await this.deliveriesService.updateAllocations(id, user, dto);
  }
}
