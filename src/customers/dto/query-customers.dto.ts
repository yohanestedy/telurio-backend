import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, Length } from 'class-validator';
import { PaginationDto } from '../../common';

export class QueryCustomersDto extends PaginationDto {
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
