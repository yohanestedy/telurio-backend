import { IsDateString, IsIn, IsOptional, IsUUID } from 'class-validator';
import { PaginationDto, sortOrders } from '../../common';
import type { SortOrder } from '../../common';

export const stockMovementSortFields = [
  'movementDate',
  'createdAt',
  'quantityKg',
  'movementType',
] as const;
export type StockMovementSortField = (typeof stockMovementSortFields)[number];

export const stockMovementDirectionValues = ['IN', 'OUT'] as const;
export const stockMovementTypeValues = [
  'PRODUCTION_IN',
  'PRODUCTION_CORRECTION_IN',
  'PRODUCTION_CORRECTION_OUT',
  'ALLOCATION_OUT',
  'ALLOCATION_RELEASE',
  'MANUAL_ADJUST_IN',
  'MANUAL_ADJUST_OUT',
] as const;

export class QueryStockMovementsDto extends PaginationDto {
  @IsOptional()
  @IsIn(stockMovementSortFields)
  sortBy: StockMovementSortField = 'movementDate';

  @IsOptional()
  @IsIn(sortOrders)
  order: SortOrder = 'desc';

  @IsOptional()
  @IsUUID()
  coopId?: string;

  @IsOptional()
  @IsIn(stockMovementDirectionValues)
  direction?: (typeof stockMovementDirectionValues)[number];

  @IsOptional()
  @IsIn(stockMovementTypeValues)
  movementType?: (typeof stockMovementTypeValues)[number];

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}
