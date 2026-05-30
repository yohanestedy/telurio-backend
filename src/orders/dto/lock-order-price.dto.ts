import { Type } from 'class-transformer';
import { IsNumber, IsOptional, Min } from 'class-validator';

export class LockOrderPriceDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 0 })
  @Min(5000)
  customPricePerKg?: number;
}
