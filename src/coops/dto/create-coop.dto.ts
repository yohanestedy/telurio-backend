import { Type } from 'class-transformer';
import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';

export class CreateCoopDto {
  @IsString()
  @Length(2, 120)
  name: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 0 })
  @Min(1)
  population: number;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  chickenStrain?: string;

  @IsOptional()
  @IsDateString()
  chickBirthDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  depreciationPercent?: number;
}
