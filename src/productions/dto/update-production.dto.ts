import { Type } from 'class-transformer';
import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Min,
} from 'class-validator';

export class UpdateProductionDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  goodKg?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  goodCount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  brokenCount?: number;

  @IsOptional()
  @IsString()
  @Length(1, 255)
  notes?: string;
}
