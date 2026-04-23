import { IsDateString, IsOptional } from 'class-validator';

export class QueryCurrentEggPriceDto {
  @IsOptional()
  @IsDateString()
  date?: string;
}
