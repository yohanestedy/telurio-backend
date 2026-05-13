import {
  IsDateString,
  IsEnum,
  IsIn,
  IsOptional,
  IsUUID,
} from 'class-validator';
import { CoopHealthRecordType } from '@prisma/client';
import { PaginationDto, sortOrders } from '../../common';
import type { SortOrder } from '../../common';

export const coopHealthSortFields = ['date', 'createdAt', 'type'] as const;
export type CoopHealthSortField = (typeof coopHealthSortFields)[number];

export class QueryCoopHealthRecordsDto extends PaginationDto {
  @IsOptional()
  @IsIn(coopHealthSortFields)
  sortBy: CoopHealthSortField = 'date';

  @IsOptional()
  @IsIn(sortOrders)
  order: SortOrder = 'desc';

  @IsOptional()
  @IsUUID()
  coopId?: string;

  @IsOptional()
  @IsEnum(CoopHealthRecordType)
  type?: CoopHealthRecordType;

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
