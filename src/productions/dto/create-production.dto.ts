import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Min,
} from 'class-validator';

export class CreateProductionDto {
  @IsDateString()
  date: string;

  @IsUUID()
  coopId: string;

  @IsString()
  @Length(1, 50)
  collectionTime: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  goodKg: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  goodCount: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  brokenCount?: number;

  @IsOptional()
  @IsString()
  @Length(1, 255)
  notes?: string;
}
