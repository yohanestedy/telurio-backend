import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString, Length } from 'class-validator';
import { PaginationDto } from '../../common';

export const customerSortFields = ['createdAt', 'name', 'phone'] as const;
export type CustomerSortField = (typeof customerSortFields)[number];

export class QueryCustomersDto extends PaginationDto {
  @IsOptional()
  @IsIn(customerSortFields)
  sortBy: CustomerSortField = 'createdAt';

  @IsOptional()
  @IsString()
  @Length(1, 120)
  search?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return undefined;
  })
  @Type(() => Boolean)
  @IsBoolean()
  isDeleted?: boolean;
}
