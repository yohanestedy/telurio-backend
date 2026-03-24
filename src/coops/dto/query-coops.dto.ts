import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';
import { PaginationDto } from '../../common';

export class QueryCoopsDto extends PaginationDto {
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
