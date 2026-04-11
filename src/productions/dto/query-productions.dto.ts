import { IsDateString, IsIn, IsOptional, IsUUID } from 'class-validator';
import { PaginationDto, sortOrders } from '../../common';
import type { SortOrder } from '../../common';

export const productionSortFields = [
  'date',
  'createdAt',
  'goodKg',
  'goodCount',
] as const;
export type ProductionSortField = (typeof productionSortFields)[number];

export class QueryProductionsDto extends PaginationDto {
  @IsOptional()
  @IsIn(productionSortFields)
  sortBy: ProductionSortField = 'date';

  @IsOptional()
  @IsIn(sortOrders)
  order: SortOrder = 'asc';

  @IsOptional()
  @IsUUID()
  coopId?: string;

  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}
