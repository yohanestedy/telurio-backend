import { IsDateString, IsOptional, IsUUID } from 'class-validator';
import { PaginationDto } from '../../common';

export class QueryProductionsDto extends PaginationDto {
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
