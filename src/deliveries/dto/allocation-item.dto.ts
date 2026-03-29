import { Type } from 'class-transformer';
import { IsNumber, IsUUID, Min } from 'class-validator';

export class AllocationItemDto {
  @IsUUID()
  coopId: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  quantityKg: number;
}
