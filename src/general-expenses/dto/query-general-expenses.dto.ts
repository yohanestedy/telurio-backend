import { IsDateString, IsIn, IsOptional, IsUUID } from 'class-validator';
import { PaginationDto, sortOrders } from '../../common';
import type { SortOrder } from '../../common';

export const generalExpenseSortFields = [
  'date',
  'createdAt',
  'amount',
] as const;
export type GeneralExpenseSortField = (typeof generalExpenseSortFields)[number];

export class QueryGeneralExpensesDto extends PaginationDto {
  @IsOptional()
  @IsIn(generalExpenseSortFields)
  sortBy: GeneralExpenseSortField = 'date';

  @IsOptional()
  @IsIn(sortOrders)
  order: SortOrder = 'desc';

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsUUID()
  ownerId?: string;
}
