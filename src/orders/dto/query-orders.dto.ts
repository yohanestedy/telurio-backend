import {
  DeliveryStatus,
  OrderLifecycleStatus,
  PaymentStatus,
} from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsOptional,
  IsUUID,
} from 'class-validator';
import { PaginationDto, sortOrders } from '../../common';
import type { SortOrder } from '../../common';

export const orderSortFields = [
  'deliveryDate',
  'createdAt',
  'quantityKg',
  'deliveryStatus',
  'paymentStatus',
] as const;
export type OrderSortField = (typeof orderSortFields)[number];

export class QueryOrdersDto extends PaginationDto {
  @IsOptional()
  @IsIn(orderSortFields)
  sortBy: OrderSortField = 'deliveryDate';

  @IsOptional()
  @IsIn(sortOrders)
  order: SortOrder = 'asc';

  @IsOptional()
  @IsDateString()
  deliveryDate?: string;

  @IsOptional()
  @IsEnum(DeliveryStatus)
  deliveryStatus?: DeliveryStatus;

  @IsOptional()
  @IsEnum(PaymentStatus)
  paymentStatus?: PaymentStatus;

  @IsOptional()
  @IsEnum(OrderLifecycleStatus)
  lifecycleStatus?: OrderLifecycleStatus;

  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}
