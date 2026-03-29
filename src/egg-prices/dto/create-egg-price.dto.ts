import { Type } from 'class-transformer';
import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Min,
} from 'class-validator';

export class CreateEggPriceDto {
  @IsDateString()
  effectiveDate: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 0 })
  @Min(0)
  pricePerKg: number;

  @IsOptional()
  @IsString()
  @Length(1, 255)
  notes?: string;
}
