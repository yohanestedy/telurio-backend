import { IsDateString, IsIn, IsOptional } from 'class-validator';
import { PaginationDto } from '../../common';

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
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}
