import { IsDateString, IsIn, IsOptional, IsUUID } from 'class-validator';
import { PaginationDto, sortOrders } from '../../common';
import type { SortOrder } from '../../common';

export const expenseSortFields = [
  'date',
  'createdAt',
  'amount',
] as const;
export type ExpenseSortField = (typeof expenseSortFields)[number];

export class QueryExpensesDto extends PaginationDto {
  @IsOptional()
  @IsIn(expenseSortFields)
  sortBy: ExpenseSortField = 'date';

  @IsOptional()
  @IsIn(sortOrders)
  order: SortOrder = 'asc';

  @IsOptional()
  @IsUUID()
  coopId?: string;

  @IsOptional()
  @IsUUID()
  ownerId?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsUUID()
  expenseCategoryId?: string;
}
