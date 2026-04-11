import { IsDateString, IsIn, IsOptional } from 'class-validator';
import { PaginationDto, sortOrders } from '../../common';
import type { SortOrder } from '../../common';

export const eggPriceSortFields = [
  'effectiveDate',
  'createdAt',
  'pricePerKg',
] as const;
export type EggPriceSortField = (typeof eggPriceSortFields)[number];

export class QueryEggPricesDto extends PaginationDto {
  @IsOptional()
  @IsIn(eggPriceSortFields)
  sortBy: EggPriceSortField = 'effectiveDate';

  @IsOptional()
  @IsIn(sortOrders)
  order: SortOrder = 'asc';

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}
