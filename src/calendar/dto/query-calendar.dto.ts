import { IsDateString, IsIn, IsOptional } from 'class-validator';

export class QueryCalendarDto {
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsIn(['month', 'week', 'day'])
  view?: 'month' | 'week' | 'day';
}
