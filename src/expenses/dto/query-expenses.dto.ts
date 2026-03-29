import { IsDateString, IsOptional, IsUUID } from 'class-validator';
import { PaginationDto } from '../../common';

export class QueryExpensesDto extends PaginationDto {
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
