import { Role } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsIn, IsOptional, IsUUID } from 'class-validator';
import { PaginationDto, sortOrders } from '../../common';
import type { SortOrder } from '../../common';

export const userSortFields = [
  'createdAt',
  'name',
  'username',
  'role',
] as const;
export type UserSortField = (typeof userSortFields)[number];

export class QueryUsersDto extends PaginationDto {
  @IsOptional()
  @IsIn(userSortFields)
  sortBy: UserSortField = 'createdAt';

  @IsOptional()
  @IsIn(sortOrders)
  order: SortOrder = 'asc';

  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @Type(() => Boolean)
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsUUID()
  coopId?: string;
}
