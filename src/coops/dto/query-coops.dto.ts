import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional } from 'class-validator';
import { PaginationDto, sortOrders } from '../../common';
import type { SortOrder } from '../../common';

export const coopSortFields = [
  'createdAt',
  'updatedAt',
  'name',
  'population',
] as const;
export type CoopSortField = (typeof coopSortFields)[number];

export class QueryCoopsDto extends PaginationDto {
  @IsOptional()
  @IsIn(coopSortFields)
  sortBy: CoopSortField = 'createdAt';

  @IsOptional()
  @IsIn(sortOrders)
  order: SortOrder = 'asc';

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return undefined;
  })
  @Type(() => Boolean)
  @IsBoolean()
  isActive?: boolean;
}
