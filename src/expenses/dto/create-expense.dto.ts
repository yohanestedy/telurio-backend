import { Type } from 'class-transformer';
import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Min,
} from 'class-validator';

export class CreateExpenseDto {
  @IsDateString()
  date: string;

  @IsUUID()
  coopId: string;

  @IsOptional()
  @IsUUID()
  expenseCategoryId?: string | null;

  @IsString()
  @Length(2, 120)
  categoryLabel: string;

  @IsOptional()
  @IsString()
  @Length(1, 255)
  description?: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 0 })
  @Min(0)
  amount: number;

  @IsOptional()
  @IsString()
  @Length(1, 255)
  notes?: string;
}
