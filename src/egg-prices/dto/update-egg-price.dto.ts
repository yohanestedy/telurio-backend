import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, Length, Min } from 'class-validator';

export class UpdateEggPriceDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 0 })
  @Min(0)
  pricePerKg?: number;

  @IsOptional()
  @IsString()
  @Length(1, 255)
  notes?: string;
}
