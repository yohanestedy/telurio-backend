import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString, Length } from 'class-validator';
import { PaginationDto, sortOrders } from '../../common';
import type { SortOrder } from '../../common';

export const customerSortFields = ['createdAt', 'name', 'phone'] as const;
export type CustomerSortField = (typeof customerSortFields)[number];

export class QueryCustomersDto extends PaginationDto {
  @IsOptional()
  @IsIn(customerSortFields)
  sortBy: CustomerSortField = 'createdAt';

  @IsOptional()
  @IsIn(sortOrders)
  order: SortOrder = 'asc';

  @IsOptional()
  @IsString()
  @Length(1, 120)
  search?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (value === true || value === 'true') return true;
    if (value === false || value === 'false') return false;
    return value;
  })
  @IsBoolean()
  isDeleted?: boolean;
}
