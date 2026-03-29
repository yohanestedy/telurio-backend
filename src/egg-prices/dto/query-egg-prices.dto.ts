import { IsDateString, IsOptional } from 'class-validator';
import { PaginationDto } from '../../common';

export class QueryEggPricesDto extends PaginationDto {
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}
