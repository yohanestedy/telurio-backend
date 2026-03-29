import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser, Roles } from '../common';
import { CreatePaymentUpdateDto } from './dto';
import { PaymentsService } from './payments.service';

@Controller('orders')
export class PaymentsController {
  constructor(private paymentsService: PaymentsService) {}

  @Post(':id/payment-updates')
  @Roles(Role.ADMIN, Role.OWNER, Role.OPERATOR)
  async updatePayment(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: { id: string; role: Role },
    @Body() dto: CreatePaymentUpdateDto,
  ) {
    return await this.paymentsService.updatePayment(id, user, dto);
  }

  @Get(':id/payment-history')
  @Roles(Role.ADMIN, Role.OWNER, Role.OPERATOR)
  async getPaymentHistory(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: { id: string; role: Role },
  ) {
    return await this.paymentsService.getPaymentHistory(id, user);
  }
}
