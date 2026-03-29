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
import { CreateCustomerDto, QueryCustomersDto, UpdateCustomerDto } from './dto';
import { CustomersService } from './customers.service';

@Controller('customers')
export class CustomersController {
  constructor(private customersService: CustomersService) {}

  @Get()
  @Roles(Role.ADMIN, Role.OWNER)
  async listCustomers(@Query() query: QueryCustomersDto) {
    return await this.customersService.listCustomers(query);
  }

  @Post()
  @Roles(Role.ADMIN)
  async createCustomer(
    @CurrentUser() user: { id: string },
    @Body() dto: CreateCustomerDto,
  ) {
    return await this.customersService.createCustomer(user, dto);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  async updateCustomer(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: { id: string },
    @Body() dto: UpdateCustomerDto,
  ) {
    return await this.customersService.updateCustomer(id, user, dto);
  }
}
